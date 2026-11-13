import { NextRequest, NextResponse } from 'next/server';
import { requireEngineScope } from '@/lib/engine/guard';
import { getAuditTrail } from '@/lib/engine/audit';

// ─── Immutable audit log viewer (§11, §15) ───────────────────────────

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const scope = await requireEngineScope(sp.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const rows = await getAuditTrail({
    clientId: scope.scope.clientId,
    action: sp.get('action') ?? undefined,
    limit: Math.min(Number(sp.get('limit') ?? 100), 500),
  });

  return NextResponse.json({
    events: rows.map(r => ({
      id: r.id,
      clientId: r.clientId,
      actor: r.actor,
      actorRole: r.actorRole,
      action: r.action,
      resource: r.resource,
      resourceId: r.resourceId,
      before: r.before ? JSON.parse(r.before) : null,
      after: r.after ? JSON.parse(r.after) : null,
      justification: r.justification,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
