import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { fireEvent } from '@/lib/automation';

/** GET /api/crm/tasks — open + recently completed tasks */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const tasks = await db.crmTask.findMany({
    include: {
      contact: { select: { name: true, phone: true } },
      lead: { select: { title: true, course: true } },
    },
    orderBy: [{ done: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
  });

  const now = new Date();
  return NextResponse.json({
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      done: t.done,
      dueAt: t.dueAt?.toISOString() ?? null,
      priority: t.priority,
      origin: t.origin,
      overdue: !t.done && !!t.dueAt && t.dueAt < now,
      contactName: t.contact?.name ?? null,
      contactPhone: t.contact?.phone ?? null,
      leadTitle: t.lead?.title ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
  });
}

/** POST /api/crm/tasks — create manual task */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    dueAt?: string;
    priority?: string;
    contactId?: string;
    leadId?: string;
  };

  const title = (body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'টাস্কের শিরোনাম দিন।' }, { status: 400 });

  let dueAt: Date | null = null;
  if (body.dueAt) {
    const d = new Date(body.dueAt);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'তারিখ সঠিক নয়।' }, { status: 400 });
    dueAt = d;
  }

  const task = await db.crmTask.create({
    data: {
      title,
      dueAt,
      priority: ['low', 'medium', 'high'].includes(body.priority ?? '') ? body.priority! : 'medium',
      contactId: body.contactId || null,
      leadId: body.leadId || null,
      origin: 'manual',
    },
  });

  return NextResponse.json({ ok: true, task: { id: task.id } });
}

/** PATCH /api/crm/tasks — toggle done / edit (fires task_completed) */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    done?: boolean;
    title?: string;
    dueAt?: string | null;
    priority?: string;
  };
  const id = body.id ?? '';
  if (!id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });

  const task = await db.crmTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: 'টাস্ক পাওয়া যায়নি।' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
  if (body.priority && ['low', 'medium', 'high'].includes(body.priority)) data.priority = body.priority;
  if (body.dueAt !== undefined) {
    if (body.dueAt === null || body.dueAt === '') data.dueAt = null;
    else {
      const d = new Date(body.dueAt);
      if (!Number.isNaN(d.getTime())) data.dueAt = d;
    }
  }
  if (typeof body.done === 'boolean') {
    data.done = body.done;
    data.completedAt = body.done ? new Date() : null;
  }

  await db.crmTask.update({ where: { id }, data });

  // Completion event → automation rules may fire (e.g. post-completion follow-ups)
  if (typeof body.done === 'boolean' && body.done && !task.done) {
    await fireEvent({ type: 'task_completed', contactId: task.contactId ?? undefined, leadId: task.leadId ?? undefined });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/crm/tasks */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });
  await db.crmTask.delete({ where: { id: body.id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
