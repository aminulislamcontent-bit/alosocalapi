import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

export const SESSION_COOKIE = 'aia_session';
export const CLIENT_SESSION_HOURS = 4;
export const ADMIN_SESSION_HOURS = 12;

// ─── Password hashing (scrypt, zero deps) ───────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

// ─── Readable temp password generator (for client accounts) ─────────

const PW_GROUPS = ['Aip', 'Km7', 'Xq2', 'Bt9', 'Vn4', 'Zr6', 'Ld3', 'Fh8'];
export function generateTempPassword(): string {
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const a = pick(PW_GROUPS);
  const b = pick(PW_GROUPS);
  const n = String(Math.floor(10 + Math.random() * 90));
  return `${a}-${b}-${n}`;
}

export function generateUsername(business: string): string {
  const base = business
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)[0] || 'client';
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}${suffix}`;
}

// ─── Sessions ────────────────────────────────────────────────────────

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
  expiresAt?: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await db.portalSession.findUnique({ where: { token: hashToken(raw) } });
  if (!session || session.expiresAt < new Date()) {
    // Clean up expired session silently
    if (session) {
      await db.portalSession.delete({ where: { token: session.token } }).catch(() => undefined);
    }
    return null;
  }

  if (session.role === 'admin' && session.adminId) {
    const admin = await db.adminUser.findUnique({ where: { id: session.adminId } });
    if (!admin) return null;
    return { role: 'admin', adminId: admin.id, username: admin.username, expiresAt: session.expiresAt.toISOString() };
  }

  if (session.role === 'client' && session.clientId) {
    const client = await db.clientAccount.findUnique({ where: { id: session.clientId } });
    if (!client) return null;
    return {
      role: 'client',
      clientId: client.id,
      username: client.username,
      name: client.name,
      business: client.business,
      status: client.status,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  return null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.portalSession.delete({ where: { token: hashToken(raw) } }).catch(() => undefined);
  }
}

// ─── Lazy seeding (staging-friendly) ────────────────────────────────

export const DEFAULT_ADMIN_USERNAME = 'alamin';
export const DEFAULT_ADMIN_PASSWORD = 'alamin2026';
export const DEMO_CLIENT_USERNAME = 'demo';
export const DEMO_CLIENT_PASSWORD = 'demo1234';

let seeded = false;

export async function ensureSeed(): Promise<void> {
  if (seeded) return;

  const admin = await db.adminUser.findUnique({ where: { username: DEFAULT_ADMIN_USERNAME } });
  if (!admin) {
    await db.adminUser.create({
      data: {
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      },
    });
  }

  const demo = await db.clientAccount.findUnique({ where: { username: DEMO_CLIENT_USERNAME } });
  if (!demo) {
    await db.clientAccount.create({
      data: {
        name: 'ডেমো ক্লায়েন্ট',
        business: 'Demo Fashion House',
        phone: '+8801700000000',
        username: DEMO_CLIENT_USERNAME,
        passwordHash: hashPassword(DEMO_CLIENT_PASSWORD),
        status: 'active',
        platforms: JSON.stringify(['facebook', 'whatsapp', 'google_analytics']),
      },
    });
  }

  seeded = true;
}
