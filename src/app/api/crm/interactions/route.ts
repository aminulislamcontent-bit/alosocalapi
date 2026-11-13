import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/** GET /api/crm/interactions?contactId= — timeline for one contact (or latest 50) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const contactId = req.nextUrl.searchParams.get('contactId');
  const items = await db.interaction.findMany({
    where: contactId ? { contactId } : undefined,
    include: {
      contact: { select: { name: true } },
      lead: { select: { title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: contactId ? 100 : 50,
  });

  return NextResponse.json({
    interactions: items.map(i => ({
      id: i.id,
      contactId: i.contactId,
      contactName: i.contact.name,
      leadTitle: i.lead?.title ?? null,
      channel: i.channel,
      body: i.body,
      origin: i.origin,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

/** POST /api/crm/interactions — log a manual call/whatsapp/note */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    contactId?: string;
    leadId?: string;
    channel?: string;
    body?: string;
  };

  const contactId = body.contactId ?? '';
  const text = (body.body ?? '').trim();
  if (!contactId || !text) {
    return NextResponse.json({ error: 'কন্টাক্ট ও বিবরণ দিন।' }, { status: 400 });
  }

  const channel = ['call', 'whatsapp', 'email', 'meeting', 'note', 'system'].includes(body.channel ?? '')
    ? body.channel!
    : 'note';

  const item = await db.interaction.create({
    data: { contactId, leadId: body.leadId || null, channel, body: text, origin: 'manual' },
  });

  return NextResponse.json({ ok: true, interaction: { id: item.id } });
}
