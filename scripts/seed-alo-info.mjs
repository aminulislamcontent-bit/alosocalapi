// Explicitly gated local data helper for ALO Education BD's own account.
// It never accesses an external CRM. It is not run by install/start scripts.
// Usage: node scripts/seed-alo-info.mjs --apply
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from './aloapi.mjs';
import { encryptVaultValue } from '../src/lib/security/vault-crypto-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const KNOWN = [
  { platform: 'facebook', fieldKey: 'page_url', value: 'https://www.facebook.com/ALOLearningJourney' },
  { platform: 'website', fieldKey: 'web_domain', value: 'aloeducation.bd' },
  { platform: 'youtube', fieldKey: 'yt_channel_url', value: 'https://www.youtube.com/@aloeducationbd' },
];

function loadLocalEnv() {
  try {
    const values = parseEnvFile(readFileSync(path.join(ROOT, '.env'), 'utf8'));
    for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
  } catch { /* environment variables may be supplied by the invoking process */ }
}

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('No changes made. Review this file and pass --apply to update only the local SQLite account.');
    return;
  }
  loadLocalEnv();
  if (!process.env.DATABASE_URL?.startsWith('file:')) throw new Error('A local SQLite DATABASE_URL is required.');
  if (!process.env.ALOAPI_VAULT_KEY || Buffer.byteLength(process.env.ALOAPI_VAULT_KEY, 'utf8') < 32) {
    throw new Error('A stable ALOAPI_VAULT_KEY of at least 32 bytes is required.');
  }

  const { createPrismaClient } = await import('./prisma-client.mjs');
  const prisma = createPrismaClient();
  try {
    const client = await prisma.clientAccount.findUnique({ where: { username: 'aloeducation' }, select: { id: true } });
    if (!client) throw new Error('Local account "aloeducation" was not found; no rows were changed.');
    let saved = 0;
    for (const item of KNOWN) {
      const encryptedValue = encryptVaultValue(item.value);
      await prisma.credentialEntry.upsert({
        where: { clientId_platform_fieldKey: { clientId: client.id, platform: item.platform, fieldKey: item.fieldKey } },
        update: { value: encryptedValue, status: 'collected' },
        create: { ...item, value: encryptedValue, clientId: client.id, status: 'collected' },
      });
      saved += 1;
    }
    console.log(`Updated ${saved} reviewed local profile field(s) with encrypted storage. Existing unrelated rows were not deleted or exported.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('Local profile update failed. No row contents were logged; confirm that the stable vault key, database, and reviewed schema are available.');
  process.exitCode = 1;
});
