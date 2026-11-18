import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the installer's preflight dependency-free: npm ci hasn't run yet.
export const NODE_RANGE = '^22.17.0 || >=24.0.0';

export function supportsNode(version) {
  const [major, minor] = version.split('.').map(Number);
  return (major === 22 && minor >= 17) || major >= 24;
}

export function projectVersion(root) {
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (typeof version !== 'string' || !version.trim()) throw new Error('Missing version in package.json.');
  return version;
}

// Invoked by install.sh before installing anything or registering a launcher.
const self = fileURLToPath(import.meta.url);
if (process.argv[1] === self) {
  if (!supportsNode(process.versions.node)) {
    console.error(`Error: Node.js ${NODE_RANGE} is required (found ${process.version}).`);
    process.exitCode = 1;
  } else {
    console.log(projectVersion(path.resolve(path.dirname(self), '..')));
  }
}
