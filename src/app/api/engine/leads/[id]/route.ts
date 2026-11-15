import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { writeAudit } from '@/lib/engine/audit';

// ─── Lead detail: full evidence trail + activity history (§6, §8) ───

function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট নির্বাচন করুন।' }, { status: 400 });

  const lead = await db.acqLead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: 'লিড পাওয়া যায়নি।' }, { status: 404 });
  if (lead.clientId !== clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const activities = await db.acqLeadActivity.findMany({
    where: { leadId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    lead: {
      ...lead,
      evidence: json<Record<string, unknown>[]>(lead.evidence, []),
      scoreBreakdown: lead.scoreBreakdown ? JSON.parse(lead.scoreBreakdown) : null,
      intentSignals: json<string[]>(lead.intentSignals, []),
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      firstSeenAt: lead.firstSeenAt.toISOString(),
      lastSeenAt: lead.lastSeenAt.toISOString(),
      freshnessAt: lead.freshnessAt?.toISOString() ?? null,
    },
    activities: activities.map(a => ({
      id: a.id,
      type: a.type,
      actor: a.actor,
      data: JSON.parse(a.data || '{}'),
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

// ─── Deletion workflow (§8): admin-only hard delete, justification required ──
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const scope = await requireEngineScope(sp.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট নির্বাচন করুন।' }, { status: 400 });

  // Hard delete is a high-impact admin decision (§12)
  if (scope.scope.user.role !== 'admin') {
    return NextResponse.json({ error: 'হার্ড ডিলিট শুধু অ্যাডমিন করতে পারেন।' }, { status: 403 });
  }

  const lead = await db.acqLead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: 'লিড পাওয়া যায়নি।' }, { status: 404 });
  if (lead.clientId !== clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const justification = sp.get('justification')?.trim();
  if (!justification) {
    return NextResponse.json({ error: 'হার্ড ডিলিটের justification আবশ্যক (audit প্রমাণ)।' }, { status: 400 });
  }

  // activities cascade-delete with the lead (schema onDelete: Cascade)
  await db.acqLead.delete({ where: { id: lead.id } });
  await writeAudit({
    clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'admin',
    actorRole: scope.scope.user.role,
    action: 'lead.hard_delete',
    resource: 'acq_lead',
    resourceId: lead.id,
    before: { businessName: lead.businessName, sourceUrl: lead.sourceUrl, pipelineStatus: lead.pipelineStatus },
    justification,
  });
  return NextResponse.json({ ok: true, deleted: lead.id });
}
