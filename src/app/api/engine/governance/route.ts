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
    action?: string;
    retentionDays?: number;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট আবশ্যক।' }, { status: 400 });

  const actor = scope.scope.user.username ?? scope.scope.user.name ?? 'user';
  const role = scope.scope.user.role;

  // ── §8 retention settings + sweep workflow ──
  if (body.action === 'set_retention') {
    if (role !== 'admin') {
      return NextResponse.json({ error: 'retentionDays সেট করা শুধু অ্যাডমিন করতে পারেন।' }, { status: 403 });
    }
    const days = Number(body.retentionDays);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      return NextResponse.json({ error: 'retentionDays হতে হবে 0–3650 এর মধ্যে (পূর্ণসংখ্যা)।' }, { status: 400 });
    }
    const before = (await db.clientAccount.findUnique({ where: { id: clientId } }))?.retentionDays ?? null;
    await db.clientAccount.update({ where: { id: clientId }, data: { retentionDays: days } });
    await writeAudit({ clientId, actor, actorRole: role, action: 'governance.set_retention', resource: 'client_account', resourceId: clientId, before: { retentionDays: before }, after: { retentionDays: days } });
    return NextResponse.json({ ok: true, retentionDays: days });
  }

  if (body.action === 'retention_sweep') {
    // Marks stale active leads as data_expired; never hard-deletes silently
    const client = await db.clientAccount.findUnique({ where: { id: clientId } });
    const days = client?.retentionDays;
    if (days === null || days === undefined) {
      return NextResponse.json({ error: 'এই টেন্যান্টের retentionDays সেট করা নেই — প্রথমে set_retention দিন।' }, { status: 400 });
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const eligible = [
      'discovered', 'data_validation', 'qualification_review', 'qualified', 'assigned',
      'contact_permitted', 'contacted', 'follow_up', 'opportunity',
    ];
    const stale = await db.acqLead.findMany({
      where: { clientId, lastSeenAt: { lt: cutoff }, pipelineStatus: { in: eligible } },
      select: { id: true },
    });
    for (const lead of stale) {
      await db.acqLead.update({ where: { id: lead.id }, data: { pipelineStatus: 'data_expired' } });
      await db.acqLeadActivity.create({
        data: { leadId: lead.id, clientId, type: 'status_change', actor, data: JSON.stringify({ field: 'pipelineStatus', after: 'data_expired', reason: `retention_sweep ${days}d` }) },
      });
    }
    await writeAudit({ clientId, actor, actorRole: role, action: 'governance.retention_sweep', resource: 'acq_lead', after: { retentionDays: days, cutoff: cutoff.toISOString(), swept: stale.length } });
    return NextResponse.json({ ok: true, swept: stale.length, cutoff: cutoff.toISOString(), retentionDays: days });
  }

  if (!body.channel || !body.identifier || !['allow', 'dnc', 'opted_out'].includes(body.status ?? '')) {
    return NextResponse.json({ error: 'channel + identifier + status (allow|dnc|opted_out) আবশ্যক।' }, { status: 400 });
  }

  const entry = await registerGovernance({
    clientId,
    channel: body.channel,
    identifier: body.identifier,
    status: body.status as 'allow' | 'dnc' | 'opted_out',
    reason: body.reason,
    source: actor,
  });

  await writeAudit({
    clientId,
    actor,
    actorRole: role,
    action: 'governance.register',
    resource: 'contact_governance',
    resourceId: entry.id,
    after: entry,
  });
  return NextResponse.json({ ok: true, entry });
}
