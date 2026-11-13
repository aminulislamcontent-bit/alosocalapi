import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { runUniversalScan } from '@/lib/engine/runner';

// ─── Universal discovery (Mode A): market opportunity reports ───────

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get('clientId');
  const scope = await requireEngineScope(requested);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const reports = await db.opportunityReport.findMany({
    where: scope.scope.clientId ? { clientId: scope.scope.clientId } : {},
    orderBy: { generatedAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({
    reports: reports.map(r => ({
      id: r.id,
      clientId: r.clientId,
      scope: JSON.parse(r.scope || '{}'),
      findings: JSON.parse(r.findings || '[]'),
      sources: JSON.parse(r.sources || '[]'),
      generatedAt: r.generatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    countries?: string[];
    industrySlugs?: string[];
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const result = await runUniversalScan({
    clientId: scope.scope.clientId,
    countries: (body.countries ?? []).map(c => String(c).toUpperCase()),
    industrySlugs: body.industrySlugs?.length ? body.industrySlugs : null,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
