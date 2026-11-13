import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

const CATEGORIES = ['course', 'fee', 'schedule', 'policy', 'faq', 'general'];

/** GET /api/crm/kb — knowledge base entries */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const entries = await db.knowledgeEntry.findMany({ orderBy: [{ category: 'asc' }, { createdAt: 'desc' }] });
  return NextResponse.json({
    entries: entries.map(e => ({
      id: e.id,
      title: e.title,
      category: e.category,
      body: e.body,
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
}

/** POST /api/crm/kb — add entry */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { title?: string; category?: string; body?: string };
  const title = (body.title ?? '').trim();
  const text = (body.body ?? '').trim();
  if (!title || !text) return NextResponse.json({ error: 'শিরোনাম ও বিবরণ দিন।' }, { status: 400 });

  const entry = await db.knowledgeEntry.create({
    data: {
      title,
      body: text,
      category: CATEGORIES.includes(body.category ?? '') ? body.category! : 'general',
    },
  });
  return NextResponse.json({ ok: true, entry: { id: entry.id } });
}

/** PATCH /api/crm/kb — edit entry */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; title?: string; body?: string; category?: string };
  const id = body.id ?? '';
  if (!id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
  if (typeof body.body === 'string' && body.body.trim()) data.body = body.body.trim();
  if (body.category && CATEGORIES.includes(body.category)) data.category = body.category;

  const entry = await db.knowledgeEntry.update({ where: { id }, data }).catch(() => null);
  if (!entry) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/crm/kb */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'আইডি প্রয়োজন।' }, { status: 400 });
  await db.knowledgeEntry.delete({ where: { id: body.id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
