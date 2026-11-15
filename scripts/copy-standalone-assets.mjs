#!/usr/bin/env node
import { cp, mkdir, readdir } from 'node:fs/promises';
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
