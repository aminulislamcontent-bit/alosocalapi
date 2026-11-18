#!/usr/bin/env node
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

async function copyDirectoryContents(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    await cp(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true, force: true });
  }
}

const root = process.cwd();
await copyDirectoryContents(path.join(root, '.next', 'static'), path.join(root, '.next', 'standalone', '.next', 'static'));
await copyDirectoryContents(path.join(root, 'public'), path.join(root, '.next', 'standalone', 'public'));


// Private runtime configuration must never ship with the standalone server.
// Next.js file tracing can copy `.env`/`.env.local`/`.env.production` from the
// project root; strip every such file and restore only the public template.
async function removePrivateEnvFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await removePrivateEnvFiles(target);
    } else if (entry.name.startsWith('.env') && entry.name !== '.env.example') {
      await rm(target, { force: true });
    }
  }
}

const standalone = path.join(root, '.next', 'standalone');
await removePrivateEnvFiles(standalone);
await cp(path.join(root, '.env.example'), path.join(standalone, '.env.example'), { force: true });
console.log('Standalone bundle: private .env files removed; .env.example template retained.');
