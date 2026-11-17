import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function resolveSqliteUrl(): string {
  const raw = process.env.DATABASE_URL || 'file:./db/custom.db';
  if (!raw.startsWith('file:')) return raw;
  const relative = decodeURIComponent(raw.slice('file:'.length).split('?')[0]);
  if (!relative || relative === ':memory:') return ':memory:';
  const abs = path.isAbsolute(relative)
    ? relative
    : path.resolve(path.join(process.cwd(), 'prisma'), relative);
  mkdirSync(path.dirname(abs), { recursive: true });
  return `file:${abs}`;
}

function makePrismaClient(): PrismaClient {
  const adapter = new PrismaLibSQL({
    url: resolveSqliteUrl(),
  });
  return new PrismaClient({ adapter });
}

// Never log SQL parameters: credential ciphertext, account details, and session data
// may otherwise leak into server logs. Enable query tracing only in an isolated test DB.
export const db = globalForPrisma.prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
