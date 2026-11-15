import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/security/request';
import { db } from '@/lib/db';
import { getSessionUser, revokeOtherSessions, verifyPassword } from '@/lib/auth';
import { encryptVaultValue, decryptVaultValue, constantTimeEqual } from '@/lib/security/vault-crypto';
import { generateRecoveryCodes, generateTotpSecret, verifyTotp } from '@/lib/security/totp';

export const runtime = 'nodejs';

function hashRecovery(code: string): string {
  return createHash('sha256').update(code.trim().replace(/\s/g, '').toUpperCase()).digest('hex');
}

async function getAdmin() {
  const user = await getSessionUser();
  if (user?.role !== 'admin' || !user.adminId) return null;
  return db.adminUser.findUnique({ where: { id: user.adminId } });
}

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Administrator authentication required.' }, { status: 401 });
  let recoveryCodesRemaining = 0;
  try {
    recoveryCodesRemaining = (JSON.parse(admin.recoveryCodeHashes) as unknown[]).length;
  } catch { /* malformed legacy field: show zero, never expose it */ }
  return NextResponse.json({ enabled: admin.mfaEnabled, recoveryCodesRemaining }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: 'Administrator authentication required.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string; currentPassword?: string; code?: string };
  const action = body.action;

  if (action === 'setup') {
    if (!body.currentPassword || !verifyPassword(body.currentPassword, admin.passwordHash)) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    }
    if (admin.mfaEnabled) return NextResponse.json({ error: 'MFA is already enabled.' }, { status: 409 });
    try {
      const secret = generateTotpSecret();
      await db.adminUser.update({ where: { id: admin.id }, data: {
        mfaPendingSecretCiphertext: encryptVaultValue(secret),
        mfaPendingSecretExpiresAt: new Date(Date.now() + 10 * 60_000),
      } });
      const label = encodeURIComponent(`ALOAPI:${admin.username}`);
      const issuer = encodeURIComponent('ALOAPI');
      const provisioningUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      return NextResponse.json({ provisioningUri, expiresInMinutes: 10 }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json({ error: 'MFA setup requires a valid ALOAPI_VAULT_KEY.' }, { status: 503 });
    }
  }

  if (action === 'confirm') {
    if (admin.mfaEnabled || !admin.mfaPendingSecretCiphertext || !admin.mfaPendingSecretExpiresAt || admin.mfaPendingSecretExpiresAt < new Date() || !/^\d{6}$/.test(body.code ?? '')) {
      return NextResponse.json({ error: 'Start MFA setup first and enter the six-digit authenticator code.' }, { status: 400 });
    }
    try {
      const secret = decryptVaultValue(admin.mfaPendingSecretCiphertext);
      if (!verifyTotp(secret, body.code ?? '')) return NextResponse.json({ error: 'Authenticator code did not verify.' }, { status: 400 });
      const recoveryCodes = generateRecoveryCodes();
      await db.adminUser.update({
        where: { id: admin.id },
        data: {
          mfaEnabled: true,
          mfaSecretCiphertext: admin.mfaPendingSecretCiphertext,
          mfaPendingSecretCiphertext: null,
          mfaPendingSecretExpiresAt: null,
          recoveryCodeHashes: JSON.stringify(recoveryCodes.map(hashRecovery)),
        },
      });
      await db.activityLog.create({ data: { actor: 'admin', action: 'admin_mfa_enabled', detail: 'Admin MFA enabled' } });
      return NextResponse.json({ enabled: true, recoveryCodes }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json({ error: 'MFA could not be enabled. Check the vault key and retry setup.' }, { status: 503 });
    }
  }

  if (action === 'disable') {
    if (!body.currentPassword || !verifyPassword(body.currentPassword, admin.passwordHash) || !admin.mfaEnabled) {
      return NextResponse.json({ error: 'MFA disable requires the current password and an active MFA enrollment.' }, { status: 401 });
    }
    let verified = false;
    if (/^\d{6}$/.test(body.code ?? '') && admin.mfaSecretCiphertext) {
      try { verified = verifyTotp(decryptVaultValue(admin.mfaSecretCiphertext), body.code ?? ''); } catch { verified = false; }
    } else if ((body.code ?? '').length >= 12) {
      try {
        const hashes = JSON.parse(admin.recoveryCodeHashes) as string[];
        const digest = hashRecovery(body.code ?? '');
        const index = hashes.findIndex(item => constantTimeEqual(item, digest));
        if (index >= 0) {
          const update = await db.adminUser.updateMany({
            where: { id: admin.id, recoveryCodeHashes: admin.recoveryCodeHashes },
            data: { recoveryCodeHashes: JSON.stringify([...hashes.slice(0, index), ...hashes.slice(index + 1)]) },
          });
          verified = update.count === 1;
        }
      } catch { verified = false; }
    }
    if (!verified) return NextResponse.json({ error: 'The authenticator/recovery code did not verify.' }, { status: 401 });
    await db.adminUser.update({ where: { id: admin.id }, data: {
      mfaEnabled: false, mfaSecretCiphertext: null, mfaPendingSecretCiphertext: null, mfaPendingSecretExpiresAt: null, recoveryCodeHashes: '[]',
    } });
    await revokeOtherSessions({ role: 'admin', adminId: admin.id });
    await db.activityLog.create({ data: { actor: 'admin', action: 'admin_mfa_disabled', detail: 'Admin MFA disabled after password and code verification' } });
    return NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ error: 'Unknown MFA action.' }, { status: 400 });
}
