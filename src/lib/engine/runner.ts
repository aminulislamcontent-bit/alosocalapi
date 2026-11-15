import { db } from '@/lib/db';
import { matchIndustry, loadTaxonomy } from './matcher';
import { leadFingerprint, tokenOverlap } from './dedupe';
import { scoreLead, autoAdvanceStatus, type EvidenceItem } from './scorer';
import { searchBusinesses } from './adapters/wikidata';
import { fetchTrends } from './adapters/trends';
import { searchNews } from './adapters/news';
import { writeAudit } from './audit';
import { usableForBudget, type ProviderMeta } from './registry';

// ─── Discovery orchestration (§6, §7): Mode A + Mode B ──────────────

const RELEVANT_STATUSES = new Set(['verified', 'rate_limited']);

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

interface CampaignConfig {
  industries: string[];
  countries: string[];
  keywords: string[];
  minScore: number;
}

async function resolveConfig(
  campaignId: string | null,
  profileId: string | null,
): Promise<{ config: CampaignConfig; campaignName: string; sourceKeys: string[]; budget: string } | null> {
  if (!campaignId) return null;
  const campaign = await db.acquisitionCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return null;
  const profile = campaign.profileId
    ? await db.targetingProfile.findUnique({ where: { id: campaign.profileId } })
    : null;
  if (!profile) return null;

  const criteria = parseJson<Record<string, unknown>>(campaign.qualificationCriteria, {});
  return {
    config: {
      industries: parseJson<string[]>(profile.industries, []),
      countries: parseJson<string[]>(profile.countries, []),
      keywords: parseJson<string[]>(profile.keywords, []),
      minScore: typeof criteria.minScore === 'number' ? criteria.minScore : 55,
    },
    campaignName: campaign.name,
    sourceKeys: parseJson<string[]>(campaign.sourceKeys, []),
    budget: campaign.budgetPreference,
  };
}

/** Mode B — admin-controlled targeted discovery for one campaign. */
export async function runTargetedDiscovery(opts: {
  clientId: string;
  campaignId: string;
  actor: string;
  actorRole: string;
  ip?: string | null;
}): Promise<{ ok: boolean; runId?: string; summary?: Record<string, unknown>; error?: string }> {
  const resolved = await resolveConfig(opts.campaignId, null);
  if (!resolved) return { ok: false, error: 'ক্যাম্পেইন বা টার্গেটিং প্রোফাইল পাওয়া যায়নি।' };
  const { config, sourceKeys, budget } = resolved;

  const campaign = await db.acquisitionCampaign.findUnique({ where: { id: opts.campaignId } });
  if (!campaign) return { ok: false, error: 'ক্যাম্পেইন পাওয়া যায়নি।' };
  if (campaign.clientId !== opts.clientId) return { ok: false, error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' };
  // §12 autonomy: suggest_only = AI suggestions only, leads never auto-advance
  const suggestOnly = campaign.autonomy === 'suggest_only';

  const run = await db.discoveryRun.create({
    data: {
      clientId: opts.clientId,
      campaignId: opts.campaignId,
      mode: 'targeted',
      status: 'running',
      params: JSON.stringify(config),
    },
  });

  const logs: string[] = [];
  const stats: Record<string, unknown> = { candidates: 0, inserted: 0, updated: 0, sources: {} };
  const taxonomy = await loadTaxonomy(true);

  // Enabled sources must be (a) selected, (b) budget-compatible, (c) verified/rate_limited
  const registry = await db.providerRegistry.findMany();
  const statusByKey = new Map(registry.map(r => [r.key, r]));
  const catalogMeta = (await import('./registry')).PROVIDER_CATALOG;
  const metaByKey = new Map<string, ProviderMeta>(catalogMeta.map(m => [m.key, m]));

  const activeSources = sourceKeys.filter(k => {
    const meta = metaByKey.get(k);
    const row = statusByKey.get(k);
    if (!meta) return false;
    if (!usableForBudget(meta, budget)) return false;
    if (meta.authRequired) return false; // OAuth sources only via verified grants (none yet)
    return RELEVANT_STATUSES.has(row?.integrationStatus ?? 'planned');
  });
  stats.enabledSources = activeSources;
  logs.push(`সক্রিয় সোর্স (যাচাইকৃত + ফ্রি-বাজেট সামঞ্জস্যপূর্ণ): ${activeSources.join(', ') || 'কোনোটি নয়'}`);
  if (suggestOnly) logs.push('autonomy=suggest_only — লিড শুধু প্রস্তাব হিসেবে থাকবে (auto-advance নেই, review_status=unverified)।');

  let inserted = 0;
  let updated = 0;
  let candidates = 0;

  // ── Public business discovery via Wikidata (verified source) ──
  if (activeSources.includes('wikidata_sparql')) {
    for (const country of config.countries.slice(0, 5)) {
      const r = await searchBusinesses({ countryCode: country, limit: 30, clientId: opts.clientId });
      if (r.status !== 'verified') {
        logs.push(`wikidata[${country}]: ${r.error ?? r.status}`);
        continue;
      }
      candidates += r.businesses.length;
      for (const biz of r.businesses) {
        const match = await matchIndustry(`${biz.industry ?? ''} ${biz.name} ${biz.description ?? ''}`, taxonomy);
        const hasIndustryFilter = config.industries.length > 0;
        const industryOk = hasIndustryFilter ? match.slug && config.industries.includes(match.slug) : true;
        if (!industryOk) continue;

        const fingerprint = leadFingerprint({ name: biz.name, website: biz.website });
        const existing = await db.acqLead.findUnique({
          where: { clientId_fingerprint: { clientId: opts.clientId, fingerprint } },
        });

        const evidence: EvidenceItem[] = [
          {
            type: 'directory',
            detail: `Wikidata entity — ইন্ডাস্ট্রি: ${biz.industry ?? 'unknown'}${biz.description ? `; ${biz.description.slice(0, 140)}` : ''}`,
            url: biz.uri,
          },
        ];

        if (existing) {
          await db.acqLead.update({
            where: { id: existing.id },
            data: { lastSeenAt: new Date(), runId: run.id },
          });
          updated++;
          continue;
        }

        const score = scoreLead({
          industrySlug: match.slug,
          matchedKeywords: match.matchedKeywords,
          campaignIndustries: config.industries.length ? config.industries : [match.slug ?? ''],
          countryCode: country,
          campaignCountries: config.countries,
          textForProductMatch: `${biz.name} ${biz.industry ?? ''} ${biz.description ?? ''}`,
          campaignKeywords: config.keywords,
          evidence,
          freshnessAt: new Date(),
          sourceReliability: statusByKey.get('wikidata_sparql')?.reliability ?? 'medium',
          hasWebsite: Boolean(biz.website),
        });

        await db.acqLead.create({
          data: {
            clientId: opts.clientId,
            campaignId: opts.campaignId,
            runId: run.id,
            fingerprint,
            businessName: biz.name,
            website: biz.website,
            category: match.slug,
            countryCode: country,
            publicContactChannel: biz.website,
            contactType: 'website_form',
            productsServices: biz.industry ?? null,
            description: biz.description ?? null,
            sourceProviderKey: 'wikidata_sparql',
            sourceUrl: biz.uri,
            evidence: JSON.stringify(evidence),
            usageRestrictions: 'Wikidata CC0 — business-level public info only; সরাসরি যোগাযোগের আগে governance চেক আবশ্যক।',
            confidence: 0.6 + (match.strength * 0.2) + (biz.website ? 0.1 : 0),
            freshnessAt: new Date(),
            pipelineStatus: suggestOnly ? 'discovered' : autoAdvanceStatus(score.score, { minScore: config.minScore }),
            reviewStatus: suggestOnly ? 'unverified' : 'verified',
            score: score.score,
            scoreBreakdown: JSON.stringify(score),
            intentSignals: JSON.stringify([]),
            lawfulBasis: 'public_business_info',
          },
        });
        inserted++;
      }
      const srcStats = stats.sources as Record<string, number>;
      srcStats[`wikidata_sparql:${country}`] = r.businesses.length;
    }
  }

  // ── Intent evidence via Google News RSS (verified source) ──
  if (activeSources.includes('google_news_rss')) {
    const queries = config.keywords.slice(0, 5);
    const countryNames = await Promise.all(
      config.countries.slice(0, 3).map(async c => ({
        code: c,
        name: (await db.geoCountry.findUnique({ where: { code: c } }))?.nameEn ?? c,
      })),
    );
    let newsAttached = 0;
    for (const kw of queries) {
      for (const c of countryNames) {
        if (newsAttached >= 15) break;
        const r = await searchNews(`${kw} ${c.name}`, { gl: c.code, clientId: opts.clientId });
        if (r.status !== 'verified') {
          logs.push(`news[${kw}/${c.code}]: ${r.error ?? r.status}`);
          continue;
        }
        for (const item of r.items.slice(0, 8)) {
          // attach to existing tenant leads whose company name overlaps the headline
          const leads = await db.acqLead.findMany({
            where: { clientId: opts.clientId, pipelineStatus: { in: ['discovered', 'data_validation'] } },
            select: { id: true, businessName: true, evidence: true, score: true, scoreBreakdown: true, intentSignals: true },
            take: 200,
          });
          for (const lead of leads) {
            const overlap = tokenOverlap(lead.businessName, item.title);
            if (overlap < 0.5) continue;
            const ev = parseJson<EvidenceItem[]>(lead.evidence, []);
            ev.push({
              type: 'news_mention',
              detail: `নিউজ মেনশন: ${item.title} (${item.source ?? 'Google News'})`,
              url: item.link,
              publishedAt: item.pubDate,
            });
            const prevScore = parseJson<{ breakdown?: { intent_evidence?: { got?: number } } }>(lead.scoreBreakdown, {});
            const oldIntent = prevScore.breakdown?.intent_evidence?.got ?? 0;
            const score = scoreLead({
              industrySlug: null,
              matchedKeywords: [],
              campaignIndustries: config.industries,
              countryCode: c.code,
              campaignCountries: config.countries,
              textForProductMatch: item.title,
              campaignKeywords: config.keywords,
              evidence: ev,
              freshnessAt: item.pubDate ? new Date(item.pubDate) : new Date(),
              sourceReliability: statusByKey.get('google_news_rss')?.reliability ?? 'medium',
              hasWebsite: true,
            });
            // keep the original scoring context: recompute intent only
            const newIntent = score.breakdown.find(b => b.key === 'intent_evidence')?.got ?? 0;
            const newScore = Math.max(0, Math.min(100, (lead.score ?? 0) - oldIntent + newIntent));
            await db.acqLead.update({
              where: { id: lead.id },
              data: {
                evidence: JSON.stringify(ev),
                intentSignals: JSON.stringify(
                  parseJson<string[]>(lead.intentSignals ?? '[]' as string, []).concat(`news_mention:${item.title.slice(0, 80)}`),
                ),
                score: newScore,
                freshnessAt: item.pubDate ? new Date(item.pubDate) : undefined,
              },
            });
            newsAttached++;
          }
        }
      }
    }
    stats.newsEvidenceAttached = newsAttached;
    logs.push(`নিউজ ইনটেন্ট ইভিডেন্স যুক্ত হয়েছে ${newsAttached} টি লিডে।`);
  }

  stats.candidates = candidates;
  stats.inserted = inserted;
  stats.updated = updated;
  stats.sourceStatus = Object.fromEntries(
    sourceKeys.map(k => [k, statusByKey.get(k)?.integrationStatus ?? 'unknown']),
  );

  const someSourceFailed = logs.some(l => l.includes('blocked') || l.includes('failing') || l.includes('rate_limited'));
  await db.discoveryRun.update({
    where: { id: run.id },
    data: {
      status: someSourceFailed ? 'partial' : 'completed',
      stats: JSON.stringify(stats),
      logs: JSON.stringify(logs),
      finishedAt: new Date(),
    },
  });

  await db.acquisitionCampaign.update({
    where: { id: opts.campaignId },
    data: { stats: JSON.stringify({ lastRunId: run.id, ...stats }), updatedAt: new Date() },
  });

  await writeAudit({
    clientId: opts.clientId,
    actor: opts.actor,
    actorRole: opts.actorRole,
    action: 'discovery.run_targeted',
    resource: 'discovery_run',
    resourceId: run.id,
    after: stats,
    ip: opts.ip,
  });

  return { ok: true, runId: run.id, summary: stats };
}

/** Mode A — universal market scan producing an opportunity report. */
export async function runUniversalScan(opts: {
  clientId: string | null;
  countries: string[];
  industrySlugs?: string[] | null;
  actor: string;
  actorRole: string;
  ip?: string | null;
}): Promise<{ ok: boolean; reportId?: string; summary?: Record<string, unknown>; error?: string }> {
  if (!opts.countries.length) {
    return { ok: false, error: 'অন্তত একটি দেশ নির্বাচন করুন (Universal mode-এ দেশ স্কোপ আবশ্যক)।' };
  }
  const countries = opts.countries.slice(0, 5);
  const taxonomy = await loadTaxonomy(true);
  const selectedSlugs = opts.industrySlugs?.length ? new Set(opts.industrySlugs) : null;

  const registry = await db.providerRegistry.findMany();
  const statusByKey = new Map(registry.map(r => [r.key, r]));
  const sourcesUsed: string[] = [];

  const countryRows = await Promise.all(
    countries.map(async c => ({
      code: c,
      name: (await db.geoCountry.findUnique({ where: { code: c } }))?.nameEn ?? c,
    })),
  );

  interface Finding {
    country: string;
    industry: string | null;
    industryName: string | null;
    demandSignals: number;
    sampleTrends: { title: string; traffic?: string; url?: string }[];
    newsMentions: number;
    sampleNews: { title: string; url: string; source?: string }[];
    opportunityScore: number;
    evidence: EvidenceItem[];
  }
  const findings: Finding[] = [];

  for (const country of countryRows) {
    // Demand signals from verified Google Trends RSS
    const trends = await fetchTrends(country.code, opts.clientId);
    if (trends.status === 'verified') sourcesUsed.push(`google_trends:${country.code}`);
    const industryHits = new Map<string, Finding>();
    for (const t of trends.items) {
      const match = await matchIndustry(t.title, taxonomy);
      if (!match.slug) continue;
      if (selectedSlugs && !selectedSlugs.has(match.slug)) continue;
      let f = industryHits.get(match.slug);
      if (!f) {
        f = {
          country: country.code,
          industry: match.slug,
          industryName: match.nameEn,
          demandSignals: 0,
          sampleTrends: [],
          newsMentions: 0,
          sampleNews: [],
          opportunityScore: 0,
          evidence: [],
        };
        industryHits.set(match.slug, f);
      }
      f.demandSignals++;
      if (f.sampleTrends.length < 5) {
        f.sampleTrends.push({ title: t.title, traffic: t.approxTraffic, url: t.newsUrl });
        f.evidence.push({
          type: 'trend',
          detail: `Search trend: "${t.title}"${t.approxTraffic ? ` (${t.approxTraffic})` : ''} — ${country.name}`,
          url: t.newsUrl ?? `https://trends.google.com/trending/rss?geo=${country.code}`,
        });
      }
    }

    // Public discussion volume via Google News RSS (max 6 queries/scan)
    const industrySlugs = [...industryHits.keys()].slice(0, 6);
    for (const slug of industrySlugs) {
      const f = industryHits.get(slug)!;
      const row = taxonomy.find(t => t.slug === slug);
      const kws = parseJson<string[]>(row?.keywords ?? '[]', []);
      const r = await searchNews(`${kws[0] ?? slug} ${country.name}`, {
        gl: country.code,
        clientId: opts.clientId,
      });
      if (r.status === 'verified') {
        sourcesUsed.push(`google_news_rss:${country.code}`);
        f.newsMentions = r.items.length;
        f.sampleNews = r.items.slice(0, 3).map(i => ({ title: i.title, url: i.link, source: i.source }));
        for (const n of f.sampleNews) {
          f.evidence.push({ type: 'news_mention', detail: `পাবলিক আলোচনা: ${n.title}`, url: n.url });
        }
      }
    }

    for (const f of industryHits.values()) {
      f.opportunityScore = f.demandSignals * 2 + f.newsMentions * 3;
      findings.push(f);
    }
  }

  findings.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const report = await db.opportunityReport.create({
    data: {
      clientId: opts.clientId,
      scope: JSON.stringify({ countries, industries: opts.industrySlugs ?? null }),
      findings: JSON.stringify(findings.slice(0, 40)),
      sources: JSON.stringify([...new Set(sourcesUsed)]),
    },
  });

  await writeAudit({
    clientId: opts.clientId,
    actor: opts.actor,
    actorRole: opts.actorRole,
    action: 'discovery.run_universal',
    resource: 'opportunity_report',
    resourceId: report.id,
    after: { findings: findings.length, countries },
    ip: opts.ip,
  });

  return {
    ok: true,
    reportId: report.id,
    summary: {
      findings: findings.length,
      sourcesUsed: [...new Set(sourcesUsed)],
      note: 'শুধুমাত্র যাচাইকৃত সোর্স (Google Trends RSS + Google News RSS) ব্যবহার করা হয়েছে।',
    },
  };
}
