import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnvFile } from './aloapi.mjs';
import { decryptVaultValue, encryptVaultValue, isVaultCiphertext } from '../src/lib/security/vault-crypto-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_SIZE = 100;

export async function migrateCredentialRows(repository) {
  // Fail before reading or writing rows unless the configured key can perform AEAD round-trip.
  const probe = encryptVaultValue('aloapi-vault-key-check');
  if (decryptVaultValue(probe) !== 'aloapi-vault-key-check') throw new Error('Vault-key preflight failed.');

  const rows = await repository.credentialEntry.findMany({ select: { id: true, value: true } });
  const changes = [];
  let alreadyEncrypted = 0;
  let empty = 0;
  for (const row of rows) {
    if (typeof row.value !== 'string') throw new Error('Credential row has an invalid stored value; migration stopped before writes.');
    if (row.value === '') { empty += 1; continue; }
    if (isVaultCiphertext(row.value)) {
      try { decryptVaultValue(row.value); }
      catch { throw new Error('At least one encrypted credential cannot be opened with the configured vault key; no migration writes were made. Restore the original ALOAPI_VAULT_KEY and retry.'); }
      alreadyEncrypted += 1;
      continue;
    }
    changes.push({ id: row.id, previous: row.value, next: encryptVaultValue(row.value) });
  }

  let updated = 0;
  for (let offset = 0; offset < changes.length; offset += BATCH_SIZE) {
    const batch = changes.slice(offset, offset + BATCH_SIZE);
    await repository.$transaction(async transaction => {
      for (const change of batch) {
        const result = await transaction.credentialEntry.updateMany({
          where: { id: change.id, value: change.previous },
          data: { value: change.next },
        });
        if (result.count !== 1) throw new Error('A credential changed during migration; this batch was rolled back. Rerun the idempotent migration.');
      }
    });
    updated += batch.length;
  }
  return { totalRows: rows.length, updated, alreadyEncrypted, empty };
}

function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  try {
    const values = parseEnvFile(readFileSync(envPath, 'utf8'));
    for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
  } catch { /* DATABASE_URL or ALOAPI_VAULT_KEY may be provided by the process environment. */ }
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL?.startsWith('file:')) throw new Error('A local SQLite DATABASE_URL is required.');
  if (!process.env.ALOAPI_VAULT_KEY || Buffer.byteLength(process.env.ALOAPI_VAULT_KEY, 'utf8') < 32) {
    throw new Error('Set the stable ALOAPI_VAULT_KEY (at least 32 UTF-8 bytes) before vault migration.');
  }
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    await db.$connect();
    const result = await migrateCredentialRows(db);
    console.log(`Credential vault migration: ${result.updated} legacy row(s) encrypted; ${result.alreadyEncrypted} already encrypted; ${result.empty} empty; ${result.totalRows} total. Values were not logged or returned.`);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Credential vault migration failed. No credential values were logged. Confirm the stable vault key, Prisma client, database, and reviewed schema; rerun safely after fixing the cause.');
    process.exitCode = 1;
  });
}
