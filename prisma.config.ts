import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

function loadEnvIfUnset(root: string) {
  const envFile = path.join(root, '.env');
  if (!existsSync(envFile)) return;
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
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

function resolveSqliteUrl(root: string): string {
  loadEnvIfUnset(root);
  if (process.env.DATABASE_URL === undefined) process.env.DATABASE_URL = 'file:./db/custom.db';
  const raw = process.env.DATABASE_URL;
  if (!raw.startsWith('file:')) return raw;
  const rel = decodeURIComponent(raw.slice('file:'.length).split('?')[0]);
  if (!rel || rel === ':memory:') return ':memory:';
  const abs = path.isAbsolute(rel) ? rel : path.resolve(path.join(root, 'prisma'), rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  return `file:${abs}`;
}

const ROOT = process.cwd();
loadEnvIfUnset(ROOT);
if (process.env.DATABASE_URL === undefined) process.env.DATABASE_URL = 'file:./db/custom.db';

export default defineConfig({
  experimental: {
    adapter: true,
  },
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  engine: 'js',
  async adapter() {
    return new PrismaLibSQL({
      url: resolveSqliteUrl(ROOT),
    });
  },
});
