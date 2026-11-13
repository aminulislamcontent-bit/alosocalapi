import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';

// ─── Unified dashboard aggregates (§15) — only real, stored data ─────

function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;

  const leadWhere = clientId ? { clientId } : {};
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

  const [pipelineByStatus, reviewByStatus, byCountry, byCategory, runs7d, reportsCount, providers, pendingApprovals, audits, contentCounts] =
    await Promise.all([
      db.acqLead.groupBy({ by: ['pipelineStatus'], where: leadWhere, _count: true }),
      db.acqLead.groupBy({ by: ['reviewStatus'], where: leadWhere, _count: true }),
      db.acqLead.groupBy({ by: ['countryCode'], where: leadWhere, _count: true }),
      db.acqLead.groupBy({ by: ['category'], where: leadWhere, _count: true }),
      db.discoveryRun.findMany({
        where: clientId ? { clientId, startedAt: { gte: sevenDaysAgo } } : { startedAt: { gte: sevenDaysAgo } },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
      db.opportunityReport.count({ where: clientId ? { clientId } : {} }),
      db.providerRegistry.findMany(),
      db.approvalRequest.count({ where: { status: 'pending', ...(clientId ? { clientId } : {}) } }),
      db.websiteAudit.findMany({
        where: clientId ? { clientId } : {},
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.contentItem.groupBy({ by: ['status'], where: clientId ? { clientId } : {}, _count: true }),
    ]);

  const scoreAgg = await db.acqLead.aggregate({
    where: clientId ? { clientId } : {},
    _avg: { score: true },
    _count: true,
  });

  return NextResponse.json({
    leads: {
      total: scoreAgg._count,
      avgScore: scoreAgg._avg.score ?? null,
      pipeline: pipelineByStatus.map(p => ({ status: p.pipelineStatus, count: p._count })),
      review: reviewByStatus.map(r => ({ status: r.reviewStatus, count: r._count })),
      byCountry: byCountry.map(c => ({ country: c.countryCode, count: c._count })),
      byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
    },
    discovery: {
      runs7d: runs7d.map(r => ({
        id: r.id,
        mode: r.mode,
        status: r.status,
        stats: json<Record<string, unknown>>(r.stats, {}),
        startedAt: r.startedAt.toISOString(),
      })),
      opportunityReports: reportsCount,
    },
    providers: {
      byStatus: providers.reduce<Record<string, number>>((acc, p) => {
        acc[p.integrationStatus] = (acc[p.integrationStatus] ?? 0) + 1;
        return acc;
      }, {}),
      verified: providers.filter(p => p.integrationStatus === 'verified').map(p => p.name),
    },
    governance: {
      pendingApprovals,
    },
    websiteGrowth: audits.map(a => ({
      id: a.id,
      url: a.url,
      scores: JSON.parse(a.scores || '{}'),
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
    content: contentCounts.map(c => ({ status: c.status, count: c._count })),
    googleFirstParty: {
      // acceptance #5: first-party Google analytics clearly distinguished
      connected: [],
      notConfigured: ['search_console', 'ga4_data', 'keyword_planner', 'google_business_profile'],
      note: 'Search Console/GA4 শুধু নিজের প্রপার্টির রিপোর্ট দেয় — গুগল সার্চারদের ব্যক্তিগত পরিচয় দেয় না; OAuth গ্র্যান্ট ছাড়া এগুলো "unavailable"।',
    },
    unavailable: [
      'search_console (OAuth প্রয়োজন)',
      'ga4_data (OAuth প্রয়োজন)',
      'keyword_planner (Google Ads টোকেন প্রয়োজন)',
      'google_business_profile (মালিকানা OAuth)',
      'meta_graph (টেন্যান্টের Meta অ্যাপ টোকেন)',
      'linkedin_api (পার্টনার অনুমোদন)',
      'osm_overpass (এই নেটওয়ার্কে unreachable)',
      'reddit_public (OAuth ছাড়া 403)',
    ],
  });
}
