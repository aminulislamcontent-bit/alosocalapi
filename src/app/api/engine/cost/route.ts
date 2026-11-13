import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';

// ─── Cost intelligence (§13): usage + free-tier warnings, USD ────────

// Self-imposed numeric guardrails (mirrors catalog freeTier notes)
const DAILY_SELF_LIMITS: Record<string, number> = {
  google_trends: 100,
  google_news_rss: 60,
  osm_nominatim: 300,
  wikidata_sparql: 120,
  pagespeed_insights: 25,
  wikimedia_pageviews: 60,
  reddit_public: 50,
  osm_overpass: 20,
};

export async function GET(req: NextRequest) {
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthPeriod = new Date().toISOString().slice(0, 7);

  const usageToday = await db.providerUsage.groupBy({
    by: ['providerKey'],
    where: {
      windowStart: { gte: dayStart },
      ...(scope.scope.clientId ? { clientId: scope.scope.clientId } : {}),
    },
    _sum: { units: true },
  });

  const ledger = await db.costLedger.findMany({
    where: {
      period: monthPeriod,
      ...(scope.scope.clientId ? { clientId: scope.scope.clientId } : {}),
    },
    orderBy: { providerKey: 'asc' },
  });

  const warnings: { providerKey: string; used: number; limit: number; pct: number }[] = [];
  for (const u of usageToday) {
    const limit = DAILY_SELF_LIMITS[u.providerKey];
    const used = u._sum.units ?? 0;
    if (limit && used >= limit * 0.7) {
      warnings.push({
        providerKey: u.providerKey,
        used,
        limit,
        pct: Math.round((used / limit) * 100),
      });
    }
  }

  const providers = await db.providerRegistry.findMany();

  return NextResponse.json({
    period: monthPeriod,
    currency: 'USD',
    estimatedUsdThisMonth: ledger.reduce((a, l) => a + l.estimatedUsd, 0),
    note: 'সব সক্রিয় সোর্স ফ্রি-টিয়ার — নীতি অনুযায়ী কোনো সাইলেন্ট চার্জ নেই। paid ব্যবহারের আগে approved paid_usage অনুমোদন আবশ্যক।',
    usageToday: usageToday.map(u => ({
      providerKey: u.providerKey,
      units: u._sum.units ?? 0,
      selfLimit: DAILY_SELF_LIMITS[u.providerKey] ?? null,
      providerName: providers.find(p => p.key === u.providerKey)?.name ?? u.providerKey,
    })),
    warnings,
    ledger: ledger.map(l => ({
      providerKey: l.providerKey,
      units: l.units,
      estimatedUsd: l.estimatedUsd,
    })),
  });
}
