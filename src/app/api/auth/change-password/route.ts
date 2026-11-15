import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, hashPassword, revokeOtherSessions, verifyPassword } from '@/lib/auth';
import { isSameOriginRequest } from '@/lib/security/request';

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { current?: string; next?: string };
  if (!body.current || !body.next) return NextResponse.json({ error: 'Enter your current and new passwords.' }, { status: 400 });
  if (body.next.length < 12 || body.next.length > 1024) return NextResponse.json({ error: 'New password must be 12–1024 characters.' }, { status: 400 });

  if (user.role === 'admin' && user.adminId) {
    const admin = await db.adminUser.findUnique({ where: { id: user.adminId } });
    if (!admin || !verifyPassword(body.current, admin.passwordHash)) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash: hashPassword(body.next) } });
    await revokeOtherSessions(user);
    await db.activityLog.create({ data: { actor: 'admin', action: 'admin_password_changed', detail: 'Administrator password changed; other sessions revoked.' } });
    return NextResponse.json({ ok: true, otherSessionsRevoked: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (user.role === 'client' && user.clientId) {
    const client = await db.clientAccount.findUnique({ where: { id: user.clientId } });
    if (!client || !verifyPassword(body.current, client.passwordHash)) return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    await db.clientAccount.update({ where: { id: client.id }, data: { passwordHash: hashPassword(body.next) } });
    await revokeOtherSessions(user);
    await db.activityLog.create({ data: {
      clientId: client.id, actor: 'client', action: 'client_password_changed', detail: 'Client password changed; other sessions revoked.',
    } });
    return NextResponse.json({ ok: true, otherSessionsRevoked: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
}
