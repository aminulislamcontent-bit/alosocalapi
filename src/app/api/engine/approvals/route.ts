import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { writeAudit } from '@/lib/engine/audit';

// ─── Human-approval workflow (§12): Suggest / Approval / Automation ──

const TYPES = new Set([
  'paid_usage', 'bulk_export', 'outbound_contact', 'public_publish',
  'credential_change', 'integration_change',
]);

export async function GET(req: NextRequest) {
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const requests = await db.approvalRequest.findMany({
    where: scope.scope.clientId ? { clientId: scope.scope.clientId } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({
    requests: requests.map(r => ({
      id: r.id,
      clientId: r.clientId,
      type: r.type,
      payload: JSON.parse(r.payload || '{}'),
      status: r.status,
      justification: r.justification,
      requestedBy: r.requestedBy,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    type?: string;
    payload?: Record<string, unknown>;
    justification?: string;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  if (!body.type || !TYPES.has(body.type)) {
    return NextResponse.json({ error: `type এর মান হতে হবে: ${[...TYPES].join(', ')}` }, { status: 400 });
  }

  const request = await db.approvalRequest.create({
    data: {
      clientId: scope.scope.clientId,
      type: body.type,
      payload: JSON.stringify(body.payload ?? {}),
      justification: body.justification ?? null,
      requestedBy: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    },
  });

  await writeAudit({
    clientId: scope.scope.clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'approval.request',
    resource: 'approval_request',
    resourceId: request.id,
    after: request,
  });
  return NextResponse.json({ ok: true, approvalId: request.id });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    decision?: string;
    justification?: string;
  };
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  // Only global admins decide approvals (separation of duties)
  if (scope.scope.user.role !== 'admin') {
    return NextResponse.json({ error: 'অনুমোদন সিদ্ধান্ত শুধু গ্লোবাল অ্যাডমিন দিতে পারেন।' }, { status: 403 });
  }
  if (!body.id || !['approved', 'rejected'].includes(body.decision ?? '')) {
    return NextResponse.json({ error: 'id + decision (approved|rejected) আবশ্যক।' }, { status: 400 });
  }

  const before = await db.approvalRequest.findUnique({ where: { id: body.id } });
  if (!before) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });
  if (before.status !== 'pending') {
    return NextResponse.json({ error: `ইতিমধ্যে ${before.status}।` }, { status: 400 });
  }

  const after = await db.approvalRequest.update({
    where: { id: body.id },
    data: {
      status: body.decision,
      decidedBy: scope.scope.user.username ?? 'admin',
      decidedAt: new Date(),
    },
  });

  await writeAudit({
    clientId: before.clientId,
    actor: scope.scope.user.username ?? 'admin',
    actorRole: 'admin',
    action: `approval.${body.decision}`,
    resource: 'approval_request',
    resourceId: body.id,
    before: { status: before.status },
    after: { status: after.status },
    justification: body.justification ?? null,
  });
  return NextResponse.json({ ok: true, status: after.status });
}
