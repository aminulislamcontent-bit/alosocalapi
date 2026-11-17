import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  exportEncryptedVaultBackup,
  getExpiringCredentials,
  listVaultCredentialsMetadata,
  restoreEncryptedVaultBackup,
  revokeVaultCredential,
  rotateVaultCredentials,
  storeVaultCredential,
} from '@/lib/onboarding/vault-service';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;
  const providerKey = req.nextUrl.searchParams.get('providerKey') || undefined;
  const mode = req.nextUrl.searchParams.get('mode') || 'list';

  if (mode === 'backup') {
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required for encrypted backup export.' }, { status: 400 });
    }
    const backup = await exportEncryptedVaultBackup(tenantId, guard.user.username);
    return NextResponse.json(backup);
  }

  const [credentials, expiring] = await Promise.all([
    listVaultCredentialsMetadata(tenantId, providerKey),
    getExpiringCredentials(14, tenantId),
  ]);

  return NextResponse.json({ credentials, expiring });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'store');
  try {
    if (action === 'store') {
      const tenantId = String(body.tenantId || '').trim();
      const providerKey = String(body.providerKey || '').trim();
      const credentialType = String(body.credentialType || 'api_key').trim();
      const label = String(body.label || 'primary').trim();
      const plaintextValue = String(body.value || '');
      const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
      if (!tenantId || !providerKey || !plaintextValue) {
        return NextResponse.json({ error: 'tenantId, providerKey, and value are required.' }, { status: 400 });
      }
      const stored = await storeVaultCredential({
        tenantId,
        providerKey,
        credentialType,
        label,
        plaintextValue,
        scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : undefined,
        expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        actor: guard.user.username,
        ip: guard.ip,
      });
      await dispatchOmniEvent({
        tenantId,
        eventType: 'credential.stored',
        providerKey,
        sourceChannel: 'vault_api',
        payload: { credentialType, label, maskedPreview: stored.maskedPreview },
        actor: guard.user.username,
      }).catch(() => undefined);

      return NextResponse.json({ credential: stored });
    }

    if (action === 'rotate') {
      const result = await rotateVaultCredentials({
        actor: guard.user.username,
        tenantId: body.tenantId ? String(body.tenantId) : undefined,
        newKey: body.newKey ? String(body.newKey) : undefined,
        ip: guard.ip,
      });
      return NextResponse.json(result);
    }

    if (action === 'revoke') {
      const credentialId = String(body.credentialId || '').trim();
      if (!credentialId) return NextResponse.json({ error: 'credentialId is required.' }, { status: 400 });
      const revoked = await revokeVaultCredential({
        credentialId,
        tenantId: body.tenantId ? String(body.tenantId) : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json({ revoked });
    }

    if (action === 'restore_backup') {
      const tenantId = String(body.tenantId || '').trim();
      const backup = body.backup as Parameters<typeof restoreEncryptedVaultBackup>[0]['backup'] | undefined;
      if (!tenantId || !backup) {
        return NextResponse.json({ error: 'tenantId and backup payload are required.' }, { status: 400 });
      }
      const restored = await restoreEncryptedVaultBackup({
        tenantId,
        backup,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(restored);
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Vault operation failed.' }, { status: 400 });
  }
}
