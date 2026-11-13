import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { checkContactAllowed } from '@/lib/engine/governance';
import { writeAudit } from '@/lib/engine/audit';

// ─── Contact gate (§8, §12, §14): never auto-contact; human approval ─
// This endpoint does NOT send anything. It records a governed workflow
// step. Actual sending happens through official channels by a human or
// an approved integration.

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    leadId?: string;
    channel?: string;
    identifier?: string;
    message?: string;
    approvalId?: string;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId || !body.leadId) return NextResponse.json({ error: 'leadId + টেন্যান্ট আবশ্যক।' }, { status: 400 });

  const lead = await db.acqLead.findUnique({ where: { id: body.leadId } });
  if (!lead) return NextResponse.json({ error: 'লিড পাওয়া যায়নি।' }, { status: 404 });
  if (lead.clientId !== clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const channel = body.channel ?? lead.contactType ?? 'website_form';
  const identifier = body.identifier ?? lead.publicContactChannel ?? lead.website ?? lead.businessName;

  const decision = await checkContactAllowed({
    clientId,
    channel,
    identifier,
    lawfulBasis: lead.lawfulBasis,
    consentStatus: lead.consentStatus,
    approvedApprovalId: body.approvalId ?? null,
  });

  const actor = scope.scope.user.username ?? scope.scope.user.name ?? 'user';
  const role = scope.scope.user.role;

  if (!decision.allowed) {
    await writeAudit({
      clientId,
      actor,
      actorRole: role,
      action: 'contact.blocked',
      resource: 'acq_lead',
      resourceId: lead.id,
      after: { channel, identifier, blockers: decision.blockers },
    });
    return NextResponse.json(
      { ok: false, blocked: true, reason: decision.reason, blockers: decision.blockers },
      { status: 403 },
    );
  }

  // Governed execution path: record the contact workflow step
  await db.acqLead.update({ where: { id: lead.id }, data: { pipelineStatus: 'contacted' } });
  await db.acqLeadActivity.create({
    data: {
      leadId: lead.id,
      clientId,
      type: 'contact',
      actor,
      data: JSON.stringify({
        channel,
        identifier,
        approvalId: body.approvalId,
        message: body.message?.slice(0, 500) ?? null,
        note: 'workflow রেকর্ড — বার্তা স্বয়ংক্রিয়ভাবে পাঠানো হয়নি',
      }),
    },
  });
  await writeAudit({
    clientId,
    actor,
    actorRole: role,
    action: 'contact.recorded',
    resource: 'acq_lead',
    resourceId: lead.id,
    after: { channel, identifier, approvalId: body.approvalId },
  });

  return NextResponse.json({
    ok: true,
    contacted: true,
    note: 'যোগাযোগ workflow হিসেবে রেকর্ড হয়েছে। কোনো বার্তা স্বয়ংক্রিয়ভাবে পাঠানো হয়নি — প্রকৃত পাঠানো অফিসিয়াল চ্যানেলে ম্যানুয়াল করুন।',
  });
}
