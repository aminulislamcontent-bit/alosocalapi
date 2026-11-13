import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, hashPassword, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'লগইন প্রয়োজন।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    current?: string;
    next?: string;
  };

  if (!body.current || !body.next) {
    return NextResponse.json({ error: 'বর্তমান ও নতুন পাসওয়ার্ড দুটোই দিন।' }, { status: 400 });
  }
  if (body.next.length < 8) {
    return NextResponse.json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।' }, { status: 400 });
  }

  if (user.role === 'admin' && user.adminId) {
    const admin = await db.adminUser.findUnique({ where: { id: user.adminId } });
    if (!admin || !verifyPassword(body.current, admin.passwordHash)) {
      return NextResponse.json({ error: 'বর্তমান পাসওয়ার্ড ভুল।' }, { status: 401 });
    }
    await db.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: hashPassword(body.next) },
    });
    await db.activityLog.create({
      data: { actor: 'admin', action: 'admin_password_changed', detail: 'Admin changed own password' },
    });
    return NextResponse.json({ ok: true });
  }

  if (user.role === 'client' && user.clientId) {
    const client = await db.clientAccount.findUnique({ where: { id: user.clientId } });
    if (!client || !verifyPassword(body.current, client.passwordHash)) {
      return NextResponse.json({ error: 'বর্তমান পাসওয়ার্ড ভুল।' }, { status: 401 });
    }
    await db.clientAccount.update({
      where: { id: client.id },
      data: { passwordHash: hashPassword(body.next) },
    });
    await db.activityLog.create({
      data: {
        clientId: client.id,
        actor: 'client',
        action: 'client_password_changed',
        detail: 'Client changed portal password',
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 403 });
}
