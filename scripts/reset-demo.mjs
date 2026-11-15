// Optional local maintenance helper. Never run automatically.
// Usage: node scripts/reset-demo.mjs --apply
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log('No changes made. Pass --apply only in an isolated local staging database.');
    return;
  }
  const client = await db.clientAccount.findUnique({ where: { username: 'demo' }, select: { id: true } });
  if (!client) throw new Error('The local demo client does not exist; no changes were made.');
  const password = `Alo-${randomBytes(18).toString('base64url')}`;
  await db.$transaction([
    db.clientAccount.update({
      where: { id: client.id },
      data: { status: 'active', passwordHash: hashPassword(password), completedAt: null },
    }),
    db.portalSession.deleteMany({ where: { role: 'client', clientId: client.id } }),
  ]);
  console.log(`Local demo client restored. One-time password: ${password}`);
  console.log('Save it securely; existing collected entries were left unchanged.');
}

main().catch(() => {
  console.error('Local demo reset failed. No row contents were logged; inspect only an isolated staging database.');
  process.exitCode = 1;
}).finally(() => db.$disconnect());
