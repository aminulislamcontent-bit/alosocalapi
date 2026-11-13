import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { fireEvent } from '@/lib/automation';
import { STAGES } from '@/lib/business';

const VALID_STAGES = STAGES.map(s => s.key);

/** GET /api/crm/leads — pipeline board data */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const leads = await db.lead.findMany({
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      tasks: { where: { done: false }, select: { id: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({
    leads: leads.map(l => ({
      id: l.id,
      title: l.title,
      stage: l.stage,
      course: l.course,
      value: l.value,
      note: l.note,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      contact: { id: l.contact.id, name: l.contact.name, phone: l.contact.phone },
      openTasks: l.tasks.length,
    })),
  });
}

/** POST /api/crm/leads — create lead for existing contact (fires lead_created) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    contactId?: string;
    title?: string;
    course?: string;
    value?: number;
    note?: string;
  };

  const contactId = body.contactId ?? '';
  const title = (body.title ?? '').trim();
  if (!contactId || !title) {
    return NextResponse.json({ error: 'কন্টাক্ট ও লিডের শিরোনাম দিন।' }, { status: 400 });
  }

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return NextResponse.json({ error: 'কন্টাক্ট পাওয়া যায়নি।' }, { status: 404 });

  const lead = await db.lead.create({
    data: {
      contactId,
      title,
      course: (body.course ?? '').trim() || null,
      value: Number(body.value) || 0,
      note: (body.note ?? '').trim() || null,
    },
  });

  const result = await fireEvent({
    type: 'lead_created',
    contactId,
    leadId: lead.id,
    contactName: contact.name,
    phone: contact.phone ?? undefined,
    leadTitle: lead.title,
    course: lead.course ?? undefined,
  });

  return NextResponse.json({ ok: true, lead: { id: lead.id }, automation: result });
}

/** PATCH /api/crm/leads — update stage/fields (stage change fires automation + timeline log) */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    stage?: string;
    title?: string;
    course?: string;
    value?: number;
    note?: string;
  };
  const id = body.id ?? '';
  if (!id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });

  const lead = await db.lead.findUnique({ where: { id }, include: { contact: true } });
  if (!lead) return NextResponse.json({ error: 'লিড পাওয়া যায়নি।' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
  if (body.course !== undefined) data.course = body.course?.trim() || null;
  if (body.value !== undefined) data.value = Number(body.value) || 0;
  if (body.note !== undefined) data.note = body.note?.trim() || null;

  const stageChanged = body.stage && body.stage !== lead.stage && VALID_STAGES.includes(body.stage);
  if (body.stage) {
    if (!VALID_STAGES.includes(body.stage)) {
      return NextResponse.json({ error: 'অপরিচিত স্টেজ।' }, { status: 400 });
    }
    data.stage = body.stage;
  }

  await db.lead.update({ where: { id }, data });

  if (stageChanged) {
    await db.interaction.create({
      data: {
        contactId: lead.contactId,
        leadId: lead.id,
        channel: 'system',
        body: `পাইপলাইন আপডেট: ${lead.title} — স্টেজ "${lead.stage}" থেকে "${body.stage}"-এ গেছে।`,
        origin: 'manual',
      },
    });
    const result = await fireEvent({
      type: 'stage_changed',
      contactId: lead.contactId,
      leadId: lead.id,
      contactName: lead.contact.name,
      phone: lead.contact.phone ?? undefined,
      leadTitle: lead.title,
      course: lead.course ?? undefined,
      fromStage: lead.stage,
      toStage: body.stage,
    });
    return NextResponse.json({ ok: true, automation: result });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/crm/leads */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });
  await db.lead.delete({ where: { id: body.id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
