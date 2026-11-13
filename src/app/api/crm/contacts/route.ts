import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { fireEvent } from '@/lib/automation';

/** GET /api/crm/contacts — list contacts with lead/task counts */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const contacts = await db.contact.findMany({
    include: {
      leads: { select: { id: true, stage: true, title: true, value: true } },
      tasks: { where: { done: false }, select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    contacts: contacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      kind: c.kind,
      grade: c.grade,
      source: c.source,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
      leadCount: c.leads.length,
      openLeads: c.leads.filter(l => !['enrolled', 'lost'].includes(l.stage)).length,
      openTasks: c.tasks.length,
    })),
  });
}

/** POST /api/crm/contacts — create contact (+ optional first lead) */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    phone?: string;
    email?: string;
    kind?: string;
    grade?: string;
    source?: string;
    address?: string;
    note?: string;
    leadTitle?: string;
    course?: string;
    leadValue?: number;
  };

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'নাম দিন।' }, { status: 400 });

  const contact = await db.contact.create({
    data: {
      name,
      phone: (body.phone ?? '').trim() || null,
      email: (body.email ?? '').trim() || null,
      kind: body.kind ?? 'student',
      grade: (body.grade ?? '').trim() || null,
      source: body.source ?? 'manual',
      address: (body.address ?? '').trim() || null,
      note: (body.note ?? '').trim() || null,
    },
  });

  // Optional first lead — runs automation (welcome + follow-up task)
  let automation = { fired: 0, details: [] as string[] };
  if ((body.leadTitle ?? '').trim()) {
    const lead = await db.lead.create({
      data: {
        contactId: contact.id,
        title: body.leadTitle!.trim(),
        course: (body.course ?? '').trim() || null,
        value: Number(body.leadValue) || 0,
      },
    });
    automation = await fireEvent({
      type: 'lead_created',
      contactId: contact.id,
      leadId: lead.id,
      contactName: contact.name,
      phone: contact.phone ?? undefined,
      leadTitle: lead.title,
      course: lead.course ?? undefined,
    });
  } else {
    automation = await fireEvent({
      type: 'contact_created',
      contactId: contact.id,
      contactName: contact.name,
      phone: contact.phone ?? undefined,
    });
  }

  return NextResponse.json({ ok: true, contact: { id: contact.id, name: contact.name }, automation });
}

/** PATCH /api/crm/contacts — update fields by id */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string } & Record<string, unknown>;
  const id = body.id ?? '';
  if (!id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });

  const data: Record<string, unknown> = {};
  for (const k of ['name', 'phone', 'email', 'kind', 'grade', 'source', 'address', 'note']) {
    if (k in body) data[k] = body[k] === '' && k !== 'name' ? null : body[k];
  }
  const contact = await db.contact.update({ where: { id }, data }).catch(() => null);
  if (!contact) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/crm/contacts — remove contact and cascade leads/tasks/interactions */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });
  await db.contact.delete({ where: { id: body.id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
