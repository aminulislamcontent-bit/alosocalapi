import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { db } from '@/lib/db';
import {
  SESSION_COOKIE,
  CLIENT_SESSION_HOURS,
  ADMIN_SESSION_HOURS,
  createSession,
  ensureBootstrapAdmin,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';
import { loginIsLocked, loginThrottleKey, recordLoginFailure, clearLoginFailures } from '@/lib/security/login-throttle';
import { constantTimeEqual, decryptVaultValue } from '@/lib/security/vault-crypto';
import { verifyTotp } from '@/lib/security/totp';
import { isSameOriginRequest } from '@/lib/security/request';

function digestRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().replace(/\s/g, '').toUpperCase()).digest('hex');
}

async function consumeRecoveryCode(adminId: string, stored: string, code: string): Promise<boolean> {
  let hashes: string[];
  try {
    hashes = JSON.parse(stored) as string[];
    if (!Array.isArray(hashes) || hashes.some(item => typeof item !== 'string')) return false;
  } catch {
    return false;
  }
  const digest = digestRecoveryCode(code);
  const index = hashes.findIndex(item => constantTimeEqual(item, digest));
  if (index < 0) return false;
  const next = [...hashes.slice(0, index), ...hashes.slice(index + 1)];
  const update = await db.adminUser.updateMany({
    where: { id: adminId, recoveryCodeHashes: stored },
    data: { recoveryCodeHashes: JSON.stringify(next) },
  });
  return update.count === 1;
}

function trustedIp(req: NextRequest): string | undefined {
  if (process.env.ALOAPI_TRUST_PROXY !== 'true') return undefined;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (!realIp || realIp.length > 64 || isIP(realIp) === 0) return undefined;
  return realIp;
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  try {
    const bootstrap = await ensureBootstrapAdmin();
    if (bootstrap === 'invalid') {
      return NextResponse.json({ error: 'Bootstrap administrator configuration is invalid. Use a valid username and a 16+ character password.' }, { status: 503 });
    }
    if (bootstrap === 'missing') {
      return NextResponse.json({ error: 'No administrator exists yet. Run `npm run aloapi -- setup` in the local terminal before signing in.', code: 'ADMIN_SETUP_REQUIRED' }, { status: 503 });
    }

    let body: { username?: string; password?: string; role?: string; mfaCode?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const username = (body.username ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const role = body.role === 'admin' ? 'admin' : 'client';
    const mfaCode = (body.mfaCode ?? '').trim();
    if (!username || !password || username.length > 128 || password.length > 1024) {
      return NextResponse.json({ error: 'Enter a username and password.' }, { status: 400 });
    }

    const throttleKey = loginThrottleKey(role, username);
    if (await loginIsLocked(throttleKey)) {
      return NextResponse.json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, { status: 429, headers: { 'Retry-After': '900', 'Cache-Control': 'no-store' } });
    }

    const ip = trustedIp(req);
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 512) || undefined;

    if (role === 'admin') {
      const admin = await db.adminUser.findUnique({ where: { username } });
      if (!admin || !verifyPassword(password, admin.passwordHash)) {
        await recordLoginFailure(throttleKey);
        return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      }

      if (process.env.ALOAPI_REQUIRE_ADMIN_MFA === 'true' && !admin.mfaEnabled) {
        return NextResponse.json({ error: 'Admin MFA is required but not enrolled. Temporarily set ALOAPI_REQUIRE_ADMIN_MFA=false, enroll in the local Security tab, then set it back to true.', code: 'ADMIN_MFA_SETUP_REQUIRED' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
      }

      if (admin.mfaEnabled) {
        if (!mfaCode) {
          return NextResponse.json({ error: 'Enter your authenticator code or one-time recovery code.', mfaRequired: true }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
        }
        let verified = false;
        if (/^\d{6}$/.test(mfaCode) && admin.mfaSecretCiphertext) {
          try {
            verified = verifyTotp(decryptVaultValue(admin.mfaSecretCiphertext), mfaCode);
          } catch {
            return NextResponse.json({ error: 'MFA is unavailable because the vault key is missing or invalid.' }, { status: 503 });
          }
        } else if (mfaCode.length >= 12) {
          verified = await consumeRecoveryCode(admin.id, admin.recoveryCodeHashes, mfaCode);
        }
        if (!verified) {
          await recordLoginFailure(throttleKey);
          return NextResponse.json({ error: 'Invalid username, password, or MFA code.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
        }
      }

      await clearLoginFailures(throttleKey);
      const raw = await createSession({ role: 'admin', adminId: admin.id, ip, userAgent });
      const store = await cookies();
      store.set(SESSION_COOKIE, raw, sessionCookieOptions(ADMIN_SESSION_HOURS * 3600));
      await db.activityLog.create({ data: { actor: 'admin', action: 'admin_login', detail: 'Administrator signed in', ip } });
      return NextResponse.json({ ok: true, role: 'admin', mfaEnabled: admin.mfaEnabled }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const client = await db.clientAccount.findUnique({ where: { username } });
    if (!client || !verifyPassword(password, client.passwordHash)) {
      await recordLoginFailure(throttleKey);
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    if (client.status !== 'active') {
      return NextResponse.json({ error: 'This account is not active. Contact the administrator.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }

    await clearLoginFailures(throttleKey);
    const raw = await createSession({ role: 'client', clientId: client.id, ip, userAgent });
    const store = await cookies();
    store.set(SESSION_COOKIE, raw, sessionCookieOptions(CLIENT_SESSION_HOURS * 3600));
    await db.activityLog.create({
      data: { clientId: client.id, actor: 'client', action: 'client_login', detail: 'Client signed in', ip },
    });
    return NextResponse.json({ ok: true, role: 'client' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Authentication service unavailable. Verify database setup and try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
