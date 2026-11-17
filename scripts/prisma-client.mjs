import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveSqliteDatabaseUrl(rawUrl = process.env.DATABASE_URL || 'file:./db/custom.db', root = ROOT) {
  if (!rawUrl || !rawUrl.startsWith('file:')) return rawUrl;
  const rel = decodeURIComponent(rawUrl.slice('file:'.length).split('?')[0]);
  if (!rel || rel === ':memory:') return ':memory:';
  const abs = path.isAbsolute(rel) ? rel : path.resolve(path.join(root, 'prisma'), rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  return `file:${abs}`;
}

export function loadLocalEnvFile(root = ROOT) {
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

export function createPrismaClient(databaseUrl) {
  loadLocalEnvFile();
  const url = resolveSqliteDatabaseUrl(databaseUrl ?? process.env.DATABASE_URL ?? 'file:./db/custom.db');
  const adapter = new PrismaLibSQL({ url });
  return new PrismaClient({ adapter });
}
