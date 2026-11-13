import { NextRequest, NextResponse } from 'next/server';
import { requireEngineScope } from '@/lib/engine/guard';
import { recordVerification } from '@/lib/engine/registry';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/engine/audit';

import { verifyTrends } from '@/lib/engine/adapters/trends';
import { verifyNews } from '@/lib/engine/adapters/news';
import { verifyNominatim } from '@/lib/engine/adapters/nominatim';
import { verifyWikidata } from '@/lib/engine/adapters/wikidata';
import { verifyPsi } from '@/lib/engine/adapters/psi';
import { verifyWikimedia } from '@/lib/engine/adapters/wikimedia';
import { verifyOverpass } from '@/lib/engine/adapters/overpass';
import { verifyReddit } from '@/lib/engine/adapters/reddit';

// ─── Real provider verification (§4): never claim without a test ────

const VERIFIERS: Record<string, () => Promise<{ status: string; check: Record<string, unknown> }>> = {
  google_trends: verifyTrends,
  google_news_rss: verifyNews,
  osm_nominatim: verifyNominatim,
  wikidata_sparql: verifyWikidata,
  pagespeed_insights: verifyPsi,
  wikimedia_pageviews: verifyWikimedia,
  osm_overpass: verifyOverpass,
  reddit_public: verifyReddit,
};

export async function POST(req: NextRequest) {
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  if (scope.scope.user.role !== 'admin') {
    return NextResponse.json({ error: 'শুধু গ্লোবাল অ্যাডমিন ভেরিফাই করতে পারেন।' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { keys?: string[] };
  const targets = body.keys?.length
    ? body.keys.filter(k => VERIFIERS[k])
    : Object.keys(VERIFIERS);

  const results: { key: string; status: string; check: Record<string, unknown> }[] = [];
  for (const key of targets) {
    try {
      const r = await VERIFIERS[key]();
      await recordVerification(key, r.status as never, r.check);
      results.push({ key, ...r });
    } catch (e) {
      const check = { error: e instanceof Error ? e.message : String(e) };
      await recordVerification(key, 'failing', check);
      results.push({ key, status: 'failing', check });
    }
  }

  await writeAudit({
    actor: scope.scope.user.username ?? 'admin',
    actorRole: 'admin',
    action: 'integration.verify_providers',
    resource: 'provider_registry',
    after: results,
  });

  return NextResponse.json({ ok: true, results });
}
