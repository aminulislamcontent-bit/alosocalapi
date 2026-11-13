import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateTempPassword, getSessionUser, hashPassword } from '@/lib/auth';

type Params = { params: Promise<{ id: string }> };

/** GET /api/admin/clients/[id] — full detail with entries + logs */
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const { id } = await params;
  const client = await db.clientAccount.findUnique({
    where: { id },
    include: {
      entries: { orderBy: [{ platform: 'asc' }, { fieldKey: 'asc' }] },
      logs: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!client) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      business: client.business,
      phone: client.phone,
      username: client.username,
      status: client.status,
      platforms: JSON.parse(client.platforms) as string[],
      note: client.note,
      createdAt: client.createdAt.toISOString(),
      completedAt: client.completedAt?.toISOString() ?? null,
      entries: client.entries.map(e => ({
        platform: e.platform,
        fieldKey: e.fieldKey,
        value: e.value,
        status: e.status,
        updatedAt: e.updatedAt.toISOString(),
      })),
      logs: client.logs.map(l => ({
        actor: l.actor,
        action: l.action,
        detail: l.detail,
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
      })),
    },
  });
}

/** PATCH /api/admin/clients/[id] — lock | unlock | reset_password */
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const client = await db.clientAccount.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });

  if (body.action === 'lock') {
    await db.clientAccount.update({ where: { id }, data: { status: 'locked' } });
    // Kill active sessions
    await db.portalSession.deleteMany({ where: { clientId: id } });
    await db.activityLog.create({
      data: { clientId: id, actor: 'admin', action: 'client_locked', detail: 'Account locked by admin' },
    });
    return NextResponse.json({ ok: true, status: 'locked' });
  }

  if (body.action === 'unlock') {
    await db.clientAccount.update({ where: { id }, data: { status: 'active' } });
    await db.activityLog.create({
      data: { clientId: id, actor: 'admin', action: 'client_unlocked', detail: 'Account unlocked — can log in again' },
    });
    return NextResponse.json({ ok: true, status: 'active' });
  }

  if (body.action === 'reset_password') {
    const tempPassword = generateTempPassword();
    await db.clientAccount.update({
      where: { id },
      data: { passwordHash: hashPassword(tempPassword), status: 'active' },
    });
    await db.portalSession.deleteMany({ where: { clientId: id } });
    await db.activityLog.create({
      data: {
        clientId: id,
        actor: 'admin',
        action: 'password_reset',
        detail: 'Temp password regenerated — old one invalidated',
      },
    });
    return NextResponse.json({ ok: true, tempPassword });
  }

  return NextResponse.json({ error: 'অজানা অ্যাকশন।' }, { status: 400 });
}

/** DELETE /api/admin/clients/[id] */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const { id } = await params;
  await db.clientAccount.delete({ where: { id } }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
