import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { decryptVaultValue, encryptVaultValue, isVaultCiphertext, maskSecret, vaultConfigured } from '@/lib/security/vault-crypto';
import { auditEvent } from '@/lib/security/audit';

const SECRET_PATTERNS = [
  /([a-z0-9_]*(?:secret|token|password|passwd|api_key|apikey|access_key|private_key|auth_token|signing_key|client_secret)["']?\s*[:=]\s*["']?)([^"'\s,\n}]{4,})(["']?)/gi,
  /(Bearer\s+)([A-Za-z0-9._~+/=-]{10,})/gi,
  /(bot\d{6,}:)([A-Za-z0-9_-]{20,})/gi,
  /(ghp_|sk_live_|rk_live_|re_|pat|xoxb-|SG\.)([A-Za-z0-9._-]{8,})/g,
];

export function redactSecretText(input: string): string {
  let out = input;
  for (const regex of SECRET_PATTERNS) {
    out = out.replace(regex, (_, prefix: string, _secret: string, suffix = '') => `${prefix}[REDACTED]${suffix}`);
  }
  return out;
}

export function redactSecretObject<T>(value: T): T {
  if (typeof value === 'string') return redactSecretText(value) as T;
  if (Array.isArray(value)) return value.map(item => redactSecretObject(item)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (/(secret|token|password|apiKey|privateKey|verifier|cipher|authHeader)/i.test(key) && typeof val === 'string') {
        out[key] = val ? maskSecret(val) : '';
      } else {
        out[key] = redactSecretObject(val);
      }
    }
    return out as T;
  }
  return value;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12);
}

export async function storeVaultCredential(params: {
  tenantId: string;
  providerKey: string;
  credentialType: string;
  label: string;
  plaintextValue: string;
  scopes?: string[];
  expiresAt?: Date | null;
  refreshable?: boolean;
  actor: string;
  ip?: string;
}) {
  if (!vaultConfigured()) {
    throw new Error('ALOAPI_VAULT_KEY is not configured or shorter than 32 bytes.');
  }
  if (!params.plaintextValue) {
    throw new Error('Credential value cannot be empty.');
  }
  const ciphertext = encryptVaultValue(params.plaintextValue);
  const keyFingerprint = fingerprint(process.env.ALOAPI_VAULT_KEY || '');

  const existing = await db.vaultCredential.findUnique({
    where: {
      clientId_providerKey_credentialType_label: {
        clientId: params.tenantId,
        providerKey: params.providerKey,
        credentialType: params.credentialType,
        label: params.label,
      },
    },
  });

  const record = existing
    ? await db.vaultCredential.update({
        where: { id: existing.id },
        data: {
          ciphertext,
          scopes: JSON.stringify(params.scopes ?? []),
          expiresAt: params.expiresAt ?? null,
          refreshable: params.refreshable ?? existing.refreshable,
          revokedAt: null,
          revokedReason: null,
          status: 'active',
          keyVersion: existing.keyVersion + 1,
        },
      })
    : await db.vaultCredential.create({
        data: {
          clientId: params.tenantId,
          providerKey: params.providerKey,
          credentialType: params.credentialType,
          label: params.label,
          ciphertext,
          scopes: JSON.stringify(params.scopes ?? []),
          expiresAt: params.expiresAt ?? null,
          refreshable: params.refreshable ?? false,
          status: 'active',
          keyVersion: 1,
        },
      });

  await auditEvent({
    actor: params.actor,
    action: 'vault.credential.store',
    target: `${params.tenantId}:${params.providerKey}:${params.credentialType}:${params.label}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { credentialId: record.id, keyFingerprint, keyVersion: record.keyVersion },
  });

  return {
    id: record.id,
    tenantId: record.clientId,
    providerKey: record.providerKey,
    credentialType: record.credentialType,
    label: record.label,
    maskedPreview: '[ENCRYPTED_AT_REST]',
    keyVersion: record.keyVersion,
    expiresAt: record.expiresAt,
    updatedAt: record.updatedAt,
  };
}

export async function listVaultCredentialsMetadata(tenantId?: string, providerKey?: string) {
  const rows = await db.vaultCredential.findMany({
    where: {
      ...(tenantId ? { clientId: tenantId } : {}),
      ...(providerKey ? { providerKey } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: {
      id: true,
      clientId: true,
      providerKey: true,
      credentialType: true,
      label: true,
      keyVersion: true,
      scopes: true,
      expiresAt: true,
      refreshable: true,
      revokedAt: true,
      revokedReason: true,
      status: true,
      lastVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const now = Date.now();
  return rows.map(row => ({
    ...row,
    tenantId: row.clientId,
    scopesList: (() => {
      try { return JSON.parse(row.scopes) as string[]; } catch { return []; }
    })(),
    effectiveStatus: row.revokedAt
      ? 'REVOKED'
      : row.expiresAt && row.expiresAt.getTime() <= now
        ? 'EXPIRED'
        : row.expiresAt && row.expiresAt.getTime() - now <= 7 * 86400_000
          ? 'EXPIRING_SOON'
          : 'ACTIVE',
  }));
}

export async function resolveVaultSecretForServer(params: {
  tenantId: string;
  providerKey: string;
  credentialType: string;
  label?: string;
  actor: string;
  reason: string;
}) {
  const row = await db.vaultCredential.findFirst({
    where: {
      clientId: params.tenantId,
      providerKey: params.providerKey,
      credentialType: params.credentialType,
      ...(params.label ? { label: params.label } : {}),
      revokedAt: null,
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw new Error(`Credential ${row.label} for ${row.providerKey} has expired.`);
  }
  const plaintext = decryptVaultValue(row.ciphertext);
  await db.vaultCredential.update({
    where: { id: row.id },
    data: { lastVerifiedAt: new Date() },
  });
  await auditEvent({
    actor: params.actor,
    action: 'vault.credential.access',
    target: `${row.clientId}:${row.providerKey}:${row.label}`,
    providerKey: row.providerKey,
    metadata: { credentialId: row.id, reason: params.reason },
  });
  return { id: row.id, plaintext, label: row.label, scopes: row.scopes };
}

export async function revokeVaultCredential(params: {
  credentialId: string;
  tenantId?: string;
  reason?: string;
  actor: string;
  ip?: string;
}) {
  const existing = await db.vaultCredential.findUnique({ where: { id: params.credentialId } });
  if (!existing) throw new Error('Credential not found.');
  if (params.tenantId && existing.clientId !== params.tenantId) {
    throw new Error('Cross-tenant credential revocation denied.');
  }
  const updated = await db.vaultCredential.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      revokedReason: params.reason || 'Revoked by administrator',
      status: 'revoked',
    },
    select: { id: true, clientId: true, providerKey: true, label: true, revokedAt: true, status: true },
  });
  await auditEvent({
    actor: params.actor,
    action: 'vault.credential.revoke',
    target: `${existing.clientId}:${existing.providerKey}:${existing.label}`,
    providerKey: existing.providerKey,
    ip: params.ip,
    metadata: { credentialId: existing.id },
  });
  return updated;
}

export async function getExpiringCredentials(withinDays = 14, tenantId?: string) {
  const rows = await listVaultCredentialsMetadata(tenantId);
  const cutoff = Date.now() + withinDays * 86400_000;
  return rows.filter(row => !row.revokedAt && row.expiresAt && row.expiresAt.getTime() <= cutoff);
}

export function reencryptWithRawKey(ciphertext: string, oldKeyText: string, newKeyText: string): string {
  const derive = (k: string) => createHash('sha256').update(k, 'utf8').digest();
  const plain = decryptVaultValue(ciphertext, derive(oldKeyText));
  return encryptVaultValue(plain, derive(newKeyText));
}

export async function rotateVaultCredentials(params: {
  actor: string;
  tenantId?: string;
  newKey?: string;
  ip?: string;
}) {
  const activeKey = process.env.ALOAPI_VAULT_KEY || '';
  if (!activeKey || Buffer.byteLength(activeKey, 'utf8') < 32) {
    throw new Error('Current ALOAPI_VAULT_KEY is required to rotate vault credentials.');
  }
  const targetKey = params.newKey || activeKey;
  if (Buffer.byteLength(targetKey, 'utf8') < 32) {
    throw new Error('New vault key must be at least 32 bytes.');
  }

  const rows = await db.vaultCredential.findMany({
    where: {
      ...(params.tenantId ? { clientId: params.tenantId } : {}),
      revokedAt: null,
    },
  });

  const targetFp = fingerprint(targetKey);
  let rotated = 0;
  await db.$transaction(async tx => {
    for (const row of rows) {
      const nextCipher = reencryptWithRawKey(row.ciphertext, activeKey, targetKey);
      await tx.vaultCredential.update({
        where: { id: row.id },
        data: {
          ciphertext: nextCipher,
          keyVersion: row.keyVersion + 1,
        },
      });
      rotated += 1;
    }
  });

  await auditEvent({
    actor: params.actor,
    action: 'vault.credential.rotate',
    target: params.tenantId ?? 'all-tenants',
    ip: params.ip,
    metadata: { rotatedCount: rotated, keyFingerprint: targetFp, newExternalKeySupplied: Boolean(params.newKey) },
  });

  return { rotatedCount: rotated, keyFingerprint: targetFp };
}

export async function exportEncryptedVaultBackup(tenantId: string, actor: string) {
  const rows = await db.vaultCredential.findMany({
    where: { clientId: tenantId },
    orderBy: [{ providerKey: 'asc' }, { label: 'asc' }],
  });
  await auditEvent({
    actor,
    action: 'vault.backup.export',
    target: tenantId,
    metadata: { recordCount: rows.length },
  });
  return {
    backupVersion: '1.0',
    exportedAt: new Date().toISOString(),
    tenantId,
    encryption: 'AES-256-GCM (v1 encrypted envelopes only; requires original ALOAPI_VAULT_KEY to restore)',
    containsPlaintextSecrets: false,
    records: rows.map(row => ({
      providerKey: row.providerKey,
      credentialType: row.credentialType,
      label: row.label,
      ciphertext: row.ciphertext,
      keyVersion: row.keyVersion,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      status: row.status,
    })),
  };
}

export async function restoreEncryptedVaultBackup(params: {
  tenantId: string;
  backup: {
    tenantId?: string;
    records?: {
      providerKey: string;
      credentialType: string;
      label: string;
      ciphertext: string;
      keyVersion?: number;
      expiresAt?: string | null;
      revokedAt?: string | null;
      status?: string;
    }[];
  };
  actor: string;
  ip?: string;
}) {
  if (!vaultConfigured()) {
    throw new Error('ALOAPI_VAULT_KEY must be configured to validate and restore encrypted vault backups.');
  }
  if (!params.backup || !Array.isArray(params.backup.records)) {
    throw new Error('Invalid vault backup payload: records array required.');
  }
  if (params.backup.tenantId && params.backup.tenantId !== params.tenantId) {
    throw new Error('Cross-tenant vault backup restoration denied.');
  }

  // Verify every record's GCM tag & key compatibility BEFORE touching the database
  for (const rec of params.backup.records) {
    if (!rec.providerKey || !rec.credentialType || !rec.label || !isVaultCiphertext(rec.ciphertext)) {
      throw new Error(`Invalid backup record envelope for ${rec.providerKey || 'unknown'}.`);
    }
    decryptVaultValue(rec.ciphertext);
  }

  let restoredCount = 0;
  await db.$transaction(async tx => {
    for (const rec of params.backup.records!) {
      await tx.vaultCredential.upsert({
        where: {
          clientId_providerKey_credentialType_label: {
            clientId: params.tenantId,
            providerKey: rec.providerKey,
            credentialType: rec.credentialType,
            label: rec.label,
          },
        },
        update: {
          ciphertext: rec.ciphertext,
          keyVersion: rec.keyVersion ?? 1,
          expiresAt: rec.expiresAt ? new Date(rec.expiresAt) : null,
          revokedAt: rec.revokedAt ? new Date(rec.revokedAt) : null,
          status: rec.status || 'active',
        },
        create: {
          clientId: params.tenantId,
          providerKey: rec.providerKey,
          credentialType: rec.credentialType,
          label: rec.label,
          ciphertext: rec.ciphertext,
          keyVersion: rec.keyVersion ?? 1,
          expiresAt: rec.expiresAt ? new Date(rec.expiresAt) : null,
          revokedAt: rec.revokedAt ? new Date(rec.revokedAt) : null,
          status: rec.status || 'active',
        },
      });
      restoredCount += 1;
    }
  });

  await auditEvent({
    actor: params.actor,
    action: 'vault.backup.restore',
    target: params.tenantId,
    ip: params.ip,
    metadata: { restoredCount },
  });

  return { restoredCount, tenantId: params.tenantId };
}
