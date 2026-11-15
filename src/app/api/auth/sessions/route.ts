import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/security/request';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { SESSION_COOKIE, getSessionUser, hashToken } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const currentToken = hashToken(raw);
  const sessions = await db.portalSession.findMany({
    where: user.role === 'admin' ? { role: 'admin', adminId: user.adminId, expiresAt: { gt: new Date() } } : { role: 'client', clientId: user.clientId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { token: true, userAgent: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
  return NextResponse.json({ sessions: sessions.map(session => ({
    current: session.token === currentToken,
    userAgent: (session.userAgent ?? 'Unknown device').slice(0, 160),
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string };
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const where = user.role === 'admin'
    ? { role: 'admin', adminId: user.adminId }
    : { role: 'client', clientId: user.clientId };
  if (body.action === 'revoke-others' && raw) {
    const result = await db.portalSession.deleteMany({ where: { ...where, token: { not: hashToken(raw) } } });
    return NextResponse.json({ ok: true, revoked: result.count }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (body.action === 'revoke-all') {
    const result = await db.portalSession.deleteMany({ where });
    store.delete(SESSION_COOKIE);
    return NextResponse.json({ ok: true, revoked: result.count }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ error: 'Unknown session action.' }, { status: 400 });
}
