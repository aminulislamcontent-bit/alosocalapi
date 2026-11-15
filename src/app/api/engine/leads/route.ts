import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { writeAudit } from '@/lib/engine/audit';
import { leadFingerprint } from '@/lib/engine/dedupe';
import { scoreLead, autoAdvanceStatus, type EvidenceItem } from '@/lib/engine/scorer';
import { registerGovernance } from '@/lib/engine/governance';

// ─── Lead management (§8): list, import (provenance-required), patch ─

const PIPELINE = new Set([
  'discovered', 'data_validation', 'qualification_review', 'qualified', 'assigned',
  'contact_permitted', 'contacted', 'follow_up', 'opportunity', 'customer', 'closed',
  'rejected', 'duplicate', 'unverified', 'do_not_contact', 'opted_out', 'data_expired',
]);
const REVIEW = new Set(['unverified', 'verified', 'rejected', 'duplicate']);

function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const scope = await requireEngineScope(sp.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ leads: [], total: 0 });

  const where = {
    clientId,
    ...(sp.get('pipelineStatus') ? { pipelineStatus: sp.get('pipelineStatus')! } : {}),
    ...(sp.get('reviewStatus') ? { reviewStatus: sp.get('reviewStatus')! } : {}),
    ...(sp.get('campaignId') ? { campaignId: sp.get('campaignId')! } : {}),
    ...(sp.get('country') ? { countryCode: sp.get('country')!.toUpperCase() } : {}),
    ...(sp.get('category') ? { category: sp.get('category')! } : {}),
    ...(sp.get('minScore') ? { score: { gte: Number(sp.get('minScore')) } } : {}),
  };

  const limit = Math.min(Number(sp.get('limit') ?? 50), 200);
  const offset = Number(sp.get('offset') ?? 0);
  const [rows, total] = await Promise.all([
    db.acqLead.findMany({ where, orderBy: { score: 'desc' }, take: limit, skip: offset }),
    db.acqLead.count({ where }),
  ]);

  return NextResponse.json({
    total,
    leads: rows.map(l => ({
      id: l.id,
      businessName: l.businessName,
      website: l.website,
      category: l.category,
      countryCode: l.countryCode,
      cityName: l.cityName,
      publicContactChannel: l.publicContactChannel,
      contactType: l.contactType,
      sourceProviderKey: l.sourceProviderKey,
      sourceUrl: l.sourceUrl,
      confidence: l.confidence,
      reviewStatus: l.reviewStatus,
      pipelineStatus: l.pipelineStatus,
      score: l.score,
      scoreBreakdown: l.scoreBreakdown ? JSON.parse(l.scoreBreakdown) : null,
      intentSignals: json<string[]>(l.intentSignals, []),
      assignedTo: l.assignedTo,
      lawfulBasis: l.lawfulBasis,
      consentStatus: l.consentStatus,
      followUpAt: l.followUpAt?.toISOString() ?? null,
      freshnessAt: l.freshnessAt?.toISOString() ?? null,
      firstSeenAt: l.firstSeenAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    campaignId?: string;
    leads?: Array<Record<string, unknown>>;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট নির্বাচন করুন।' }, { status: 400 });

  const items = Array.isArray(body.leads) ? body.leads.slice(0, 100) : [];
  if (!items.length) return NextResponse.json({ error: 'leads অ্যারে আবশ্যক।' }, { status: 400 });

  // Provenance is MANDATORY (acceptance #4)
  for (const item of items) {
    if (!item.businessName || !item.sourceProviderKey || !item.sourceUrl) {
      return NextResponse.json(
        { error: 'প্রতিটি লিডে businessName + sourceProviderKey + sourceUrl (প্রমাণসহ) আবশ্যক।' },
        { status: 400 },
      );
    }
  }

  let inserted = 0;
  let duplicated = 0;
  for (const item of items) {
    const name = String(item.businessName);
    const website = typeof item.website === 'string' ? item.website : null;
    const fingerprint = leadFingerprint({ name, website, city: String(item.cityName ?? '') });
    const existing = await db.acqLead.findUnique({
      where: { clientId_fingerprint: { clientId, fingerprint } },
    });
    if (existing) {
      duplicated++;
      await db.acqLeadActivity.create({
        data: {
          leadId: existing.id,
          clientId,
          type: 'import',
          actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
          data: JSON.stringify({ deduped: true, sourceUrl: item.sourceUrl }),
        },
      });
      continue;
    }

    const evidence = Array.isArray(item.evidence)
      ? (item.evidence as EvidenceItem[])
      : [{ type: 'manual_import', detail: `সোর্স: ${item.sourceUrl}`, url: String(item.sourceUrl) }];

    const lead = await db.acqLead.create({
      data: {
        clientId,
        campaignId: body.campaignId ?? null,
        fingerprint,
        businessName: name,
        website,
        category: typeof item.category === 'string' ? item.category : null,
        countryCode: typeof item.countryCode === 'string' ? item.countryCode.toUpperCase() : null,
        cityName: typeof item.cityName === 'string' ? item.cityName : null,
        publicContactChannel:
          typeof item.publicContactChannel === 'string' ? item.publicContactChannel : website,
        contactType: typeof item.contactType === 'string' ? item.contactType : 'website_form',
        productsServices: typeof item.productsServices === 'string' ? item.productsServices : null,
        description: typeof item.description === 'string' ? item.description : null,
        sourceProviderKey: String(item.sourceProviderKey),
        sourceUrl: String(item.sourceUrl),
        evidence: JSON.stringify(evidence),
        usageRestrictions:
          typeof item.usageRestrictions === 'string'
            ? item.usageRestrictions
            : 'সোর্স-নির্দিষ্ট লাইসেন্স মেনে ব্যবহার করুন।',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
        lawfulBasis: typeof item.lawfulBasis === 'string' ? item.lawfulBasis : null,
      },
    });
    await db.acqLeadActivity.create({
      data: {
        leadId: lead.id,
        clientId,
        type: 'import',
        actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
        data: JSON.stringify({ imported: true }),
      },
    });
    inserted++;
  }

  await writeAudit({
    clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'lead.import',
    resource: 'acq_lead',
    after: { requested: items.length, inserted, duplicated },
  });

  return NextResponse.json({ ok: true, inserted, duplicated });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    id?: string;
    action?: string;
    value?: string;
    text?: string;
    justification?: string;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId || !body.id) return NextResponse.json({ error: 'id + টেন্যান্ট আবশ্যক।' }, { status: 400 });

  const lead = await db.acqLead.findUnique({ where: { id: body.id } });
  if (!lead) return NextResponse.json({ error: 'লিড পাওয়া যায়নি।' }, { status: 404 });
  if (lead.clientId !== clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const actor = scope.scope.user.username ?? scope.scope.user.name ?? 'user';
  const role = scope.scope.user.role;

  switch (body.action) {
    case 'review_status': {
      if (!body.value || !REVIEW.has(body.value)) {
        return NextResponse.json({ error: 'অপরিচিত review status।' }, { status: 400 });
      }
      const before = lead.reviewStatus;
      const after = body.value;
      await db.acqLead.update({ where: { id: lead.id }, data: { reviewStatus: after } });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'status_change', actor, data: JSON.stringify({ field: 'reviewStatus', before, after }) },
      });
      await writeAudit({ clientId, actor, actorRole: role, action: 'lead.review_status', resource: 'acq_lead', resourceId: lead.id, before: { reviewStatus: before }, after: { reviewStatus: after }, justification: body.justification ?? null });
      return NextResponse.json({ ok: true });
    }
    case 'pipeline_status': {
      if (!body.value || !PIPELINE.has(body.value)) {
        return NextResponse.json({ error: 'অপরিচিত পাইপলাইন স্টেটাস।' }, { status: 400 });
      }
      const before = lead.pipelineStatus;
      const after = body.value;
      await db.acqLead.update({ where: { id: lead.id }, data: { pipelineStatus: after } });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'status_change', actor, data: JSON.stringify({ field: 'pipelineStatus', before, after, justification: body.justification ?? null }) },
      });
      await writeAudit({ clientId, actor, actorRole: role, action: 'lead.pipeline_status', resource: 'acq_lead', resourceId: lead.id, before: { pipelineStatus: before }, after: { pipelineStatus: after }, justification: body.justification ?? null });
      return NextResponse.json({ ok: true });
    }
    case 'assign': {
      const before = lead.assignedTo;
      await db.acqLead.update({ where: { id: lead.id }, data: { assignedTo: body.value?.trim() || null } });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'assignment', actor, data: JSON.stringify({ from: before, to: body.value }) },
      });
      await writeAudit({ clientId, actor, actorRole: role, action: 'lead.assign', resource: 'acq_lead', resourceId: lead.id, before: { assignedTo: before }, after: { assignedTo: body.value } });
      return NextResponse.json({ ok: true });
    }
    case 'note': {
      if (!body.text?.trim()) return NextResponse.json({ error: 'নোট খালি।' }, { status: 400 });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'note', actor, data: JSON.stringify({ text: body.text.trim() }) },
      });
      return NextResponse.json({ ok: true });
    }
    case 'dnc': {
      const identifier = lead.publicContactChannel ?? lead.website ?? lead.businessName;
      const channel = lead.contactType ?? 'website_form';
      await registerGovernance({
        clientId,
        channel,
        identifier,
        status: 'dnc',
        reason: body.text ?? 'DNC মার্কড ফ্রম লিড',
        source: actor,
      });
      await db.acqLead.update({ where: { id: lead.id }, data: { pipelineStatus: 'do_not_contact' } });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'governance', actor, data: JSON.stringify({ dnc: true, identifier, channel }) },
      });
      await writeAudit({ clientId, actor, actorRole: role, action: 'lead.dnc', resource: 'acq_lead', resourceId: lead.id, after: { identifier, channel } });
      return NextResponse.json({ ok: true });
    }
    case 'schedule_followup': {
      // §8 follow-up scheduling — body.value = ISO date/datetime string
      const when = body.value ? new Date(body.value) : null;
      if (!when || Number.isNaN(when.getTime())) {
        return NextResponse.json({ error: 'value হিসেবে বৈধ ISO তারিখ দিন।' }, { status: 400 });
      }
      const before = lead.followUpAt?.toISOString() ?? null;
      await db.acqLead.update({ where: { id: lead.id }, data: { followUpAt: when } });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'note', actor, data: JSON.stringify({ followup_scheduled: when.toISOString(), previous: before }) },
      });
      await writeAudit({ clientId, actor, actorRole: role, action: 'lead.schedule_followup', resource: 'acq_lead', resourceId: lead.id, before: { followUpAt: before }, after: { followUpAt: when.toISOString() } });
      return NextResponse.json({ ok: true, followUpAt: when.toISOString() });
    }
    case 'data_expired': {
      await db.acqLead.update({ where: { id: lead.id }, data: { pipelineStatus: 'data_expired' } });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'status_change', actor, data: JSON.stringify({ field: 'pipelineStatus', after: 'data_expired' }) },
      });
      await writeAudit({ clientId, actor, actorRole: role, action: 'lead.data_expired', resource: 'acq_lead', resourceId: lead.id });
      return NextResponse.json({ ok: true });
    }
    case 'recalc_score': {
      // Recompute the explainable score from stored evidence + campaign config
      if (!lead.campaignId) {
        return NextResponse.json({ error: 'এই লিডের সাথে ক্যাম্পেইন নেই — স্কোর রিক্যালকুলেট করা যাবে না।' }, { status: 400 });
      }
      const campaign = await db.acquisitionCampaign.findUnique({ where: { id: lead.campaignId } });
      if (!campaign || campaign.clientId !== clientId) {
        return NextResponse.json({ error: 'ক্যাম্পেইন এই টেন্যান্টের নয়।' }, { status: 403 });
      }
      const profile = campaign.profileId
        ? await db.targetingProfile.findUnique({ where: { id: campaign.profileId } })
        : null;
      if (!profile) return NextResponse.json({ error: 'প্রোফাইল পাওয়া যায়নি।' }, { status: 400 });
      const cfg = {
        industries: json<string[]>(profile.industries, []),
        countries: json<string[]>(profile.countries, []),
        keywords: json<string[]>(profile.keywords, []),
      };
      const { matchIndustry } = await import('@/lib/engine/matcher');
      const { scoreLead, autoAdvanceStatus } = await import('@/lib/engine/scorer');
      const match = await matchIndustry(`${lead.productsServices ?? ''} ${lead.businessName} ${lead.description ?? ''}`);
      const ev = json<EvidenceItem[]>(lead.evidence, []);
      const score = scoreLead({
        industrySlug: match.slug,
        matchedKeywords: match.matchedKeywords,
        campaignIndustries: cfg.industries,
        countryCode: lead.countryCode,
        campaignCountries: cfg.countries,
        textForProductMatch: `${lead.businessName} ${lead.productsServices ?? ''} ${lead.description ?? ''}`,
        campaignKeywords: cfg.keywords,
        evidence: ev,
        freshnessAt: lead.freshnessAt,
        sourceReliability: 'high',
        hasWebsite: Boolean(lead.website),
      });
      const criteria = json<{ minScore?: number }>(campaign.qualificationCriteria, {});
      // §12: suggest_only autonomy = suggestions only, no auto-advance
      const noAutoAdvance = campaign.autonomy === 'suggest_only';
      await db.acqLead.update({
        where: { id: lead.id },
        data: {
          score: score.score,
          scoreBreakdown: JSON.stringify(score),
          category: match.slug ?? lead.category,
          ...(noAutoAdvance ? {} : { pipelineStatus: autoAdvanceStatus(score.score, criteria) }),
        },
      });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'score', actor, data: JSON.stringify({ score: score.score, summary: score.summary }) },
      });
      await writeAudit({ clientId, actor, actorRole: role, action: 'lead.recalc_score', resource: 'acq_lead', resourceId: lead.id, after: { score: score.score } });
      return NextResponse.json({ ok: true, score: score.score, summary: score.summary });
    }
    default:
      return NextResponse.json({ error: 'অজানা action।' }, { status: 400 });
  }
}
