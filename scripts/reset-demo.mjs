// Maintenance: restore demo client to active with password demo1234 (keeps collected entries)
import { randomBytes, scryptSync } from 'crypto';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

await db.clientAccount.update({
  where: { username: 'demo' },
  data: { status: 'active', passwordHash: hashPassword('demo1234'), completedAt: null },
});
await db.portalSession.deleteMany({ where: { role: 'client' } });
console.log('Demo client restored: status=active, password=demo1234 (entries kept)');
await db.$disconnect();
