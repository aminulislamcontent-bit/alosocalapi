import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { runPsi } from '@/lib/engine/adapters/psi';
import { generateSeoRecommendations } from '@/lib/engine/ai';
import { writeAudit } from '@/lib/engine/audit';

// ─── Website Growth (§9): REAL PageSpeed Insights audits only ────────

export async function GET(req: NextRequest) {
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ audits: [] });

  const audits = await db.websiteAudit.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({
    audits: audits.map(a => ({
      id: a.id,
      url: a.url,
      scores: JSON.parse(a.scores || '{}'),
      recommendations: JSON.parse(a.recommendations || '[]'),
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { clientId?: string; url?: string };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট নির্বাচন করুন।' }, { status: 400 });

  const raw = (body.url ?? '').trim();
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
  } catch {
    return NextResponse.json({ error: 'সঠিক URL দিন।' }, { status: 400 });
  }

  const psi = await runPsi(url.toString(), clientId);
  const actor = scope.scope.user.username ?? scope.scope.user.name ?? 'user';

  if (psi.status === 'rate_limited') {
    const audit = await db.websiteAudit.create({
      data: {
        clientId,
        url: url.toString(),
        status: 'rate_limited',
        psiData: JSON.stringify({ error: psi.error ?? 'IP quota exhausted — try again later or add a free PSI API key' }),
      },
    });
    await writeAudit({ clientId, actor, actorRole: scope.scope.user.role, action: 'growth.website_audit_rate_limited', resource: 'website_audit', resourceId: audit.id });
    return NextResponse.json({
      ok: false,
      rateLimited: true,
      auditId: audit.id,
      error: 'PageSpeed Insights API এই IP থেকে এখন quota-সীমিত (429)। ডেটা আছে বলে দাবি করা হয়নি — পরে আবার চেষ্টা করুন বা ফ্রি PSI API key যোগ করুন (২৫k/দিন ফ্রি)।',
    });
  }
  if (psi.status !== 'verified' || !psi.scores) {
    await writeAudit({ clientId, actor, actorRole: scope.scope.user.role, action: 'growth.website_audit_failed', resource: 'website_audit', after: { url: url.toString(), error: psi.error } });
    return NextResponse.json({ ok: false, error: `PSI অডিট ব্যর্থ: ${psi.error ?? psi.status}` }, { status: 502 });
  }

  const recommendations = generateSeoRecommendations(psi.audits);
  const audit = await db.websiteAudit.create({
    data: {
      clientId,
      url: url.toString(),
      psiData: JSON.stringify({ scores: psi.scores }),
      scores: JSON.stringify(psi.scores),
      recommendations: JSON.stringify(recommendations),
      status: 'completed',
    },
  });

  await writeAudit({
    clientId,
    actor,
    actorRole: scope.scope.user.role,
    action: 'growth.website_audit',
    resource: 'website_audit',
    resourceId: audit.id,
    after: { url: url.toString(), scores: psi.scores },
  });

  return NextResponse.json({
    ok: true,
    audit: {
      id: audit.id,
      url: audit.url,
      scores: psi.scores,
      recommendations,
      status: audit.status,
      createdAt: audit.createdAt.toISOString(),
      dataSource: 'Google PageSpeed Insights (real Lighthouse data)',
    },
  });
}
