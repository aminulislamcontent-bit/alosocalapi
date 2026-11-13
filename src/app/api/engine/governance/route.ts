import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { registerGovernance } from '@/lib/engine/governance';
import { writeAudit } from '@/lib/engine/audit';

// ─── Consent / DNC / opt-out registry (§8, §14) ──────────────────────

export async function GET(req: NextRequest) {
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ entries: [] });

  const entries = await db.contactGovernance.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({
    entries: entries.map(e => ({
      id: e.id,
      channel: e.channel,
      identifier: e.identifier,
      status: e.status,
      reason: e.reason,
      source: e.source,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    channel?: string;
    identifier?: string;
    status?: string;
    reason?: string;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট আবশ্যক।' }, { status: 400 });

  if (!body.channel || !body.identifier || !['allow', 'dnc', 'opted_out'].includes(body.status ?? '')) {
    return NextResponse.json({ error: 'channel + identifier + status (allow|dnc|opted_out) আবশ্যক।' }, { status: 400 });
  }

  const entry = await registerGovernance({
    clientId,
    channel: body.channel,
    identifier: body.identifier,
    status: body.status as 'allow' | 'dnc' | 'opted_out',
    reason: body.reason,
    source: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
  });

  await writeAudit({
    clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'governance.register',
    resource: 'contact_governance',
    resourceId: entry.id,
    after: entry,
  });
  return NextResponse.json({ ok: true, entry });
}
