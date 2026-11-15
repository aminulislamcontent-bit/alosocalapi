import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

export const SESSION_COOKIE = 'aia_session';
export const CLIENT_SESSION_HOURS = 4;
export const ADMIN_SESSION_HOURS = 12;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !/^[a-f0-9]{128}$/i.test(hash ?? '')) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** Cryptographically generated, one-time client password; never use Math.random for credentials. */
export function generateTempPassword(): string {
  return `Alo-${randomBytes(18).toString('base64url')}`;
}

export function generateUsername(business: string): string {
  const base = business
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)[0] || 'client';
  return `${base}${randomInt(1000, 10_000)}`;
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function createSession(opts: {
  role: 'admin' | 'client';
  adminId?: string;
  clientId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  const hours = opts.role === 'admin' ? ADMIN_SESSION_HOURS : CLIENT_SESSION_HOURS;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await db.portalSession.create({
    data: {
      token: hashToken(raw),
      role: opts.role,
      adminId: opts.adminId ?? null,
      clientId: opts.clientId ?? null,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      expiresAt,
      lastSeenAt: new Date(),
    },
  });
  return raw;
}

export interface SessionUser {
  role: 'admin' | 'client';
  adminId?: string;
  clientId?: string;
  username?: string;
  name?: string;
  business?: string;
  status?: string;
  mfaEnabled?: boolean;
  expiresAt?: string;
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await db.portalSession.findUnique({ where: { token: hashToken(raw) } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.portalSession.delete({ where: { token: session.token } }).catch(() => undefined);
    return null;
  }

  // Do not write on every request: retain useful activity data without excessive DB churn.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.portalSession.update({ where: { token: session.token }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }

  if (session.role === 'admin' && session.adminId) {
    const admin = await db.adminUser.findUnique({ where: { id: session.adminId } });
    if (!admin) return null;
    return {
      role: 'admin', adminId: admin.id, username: admin.username,
      mfaEnabled: admin.mfaEnabled, expiresAt: session.expiresAt.toISOString(),
    };
  }

  if (session.role === 'client' && session.clientId) {
    const client = await db.clientAccount.findUnique({ where: { id: session.clientId } });
    if (!client || client.status !== 'active') return null;
    return {
      role: 'client', clientId: client.id, username: client.username,
      name: client.name, business: client.business, status: client.status,
      expiresAt: session.expiresAt.toISOString(),
    };
  }
  return null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) await db.portalSession.delete({ where: { token: hashToken(raw) } }).catch(() => undefined);
}

export async function revokeOtherSessions(user: SessionUser): Promise<number> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return 0;
  const token = hashToken(raw);
  const where = user.role === 'admin' && user.adminId
    ? { role: 'admin', adminId: user.adminId, token: { not: token } }
    : user.role === 'client' && user.clientId
      ? { role: 'client', clientId: user.clientId, token: { not: token } }
      : null;
  if (!where) return 0;
  const result = await db.portalSession.deleteMany({ where });
  return result.count;
}

/** One-time environment bootstrap for unattended first launch; never seeds demo users. */
export async function ensureBootstrapAdmin(): Promise<'ready' | 'missing' | 'invalid'> {
  if (await db.adminUser.count() > 0) return 'ready';
  const username = (process.env.ADMIN_BOOTSTRAP_USERNAME ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  if (!username || !password) return 'missing';
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || password.length < 16) return 'invalid';
  await db.adminUser.create({ data: { username, passwordHash: hashPassword(password) } });
  return 'ready';
}
