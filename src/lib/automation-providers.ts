import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// ─── AI Automation Server Provider Stack (providers/) ───────────────
// The 7 upstream repos under providers/ are pinned git submodules.
// This registry is the single source of truth the app exposes about
// them (see /api/automation/providers). It never vendors their code.

export interface AutomationProvider {
  key: string;
  repo: string;
  url: string;
  path: string;
  role: string;
  purpose: string;
  runtime: string;
  license: string;
  licenseWarning?: string;
  integration: string;
  env: string[];
  /** submodule checkout state, filled at request time */
  present: boolean;
  commit: string | null;
  configuredEnv: string[];
}

type ManifestEntry = Omit<AutomationProvider, 'present' | 'commit' | 'configuredEnv'>;

function loadManifest(): ManifestEntry[] {
  try {
    const raw = readFileSync(join(process.cwd(), 'providers', 'providers.json'), 'utf8');
    return (JSON.parse(raw).providers ?? []) as ManifestEntry[];
  } catch {
    return [];
  }
}

function submoduleCommit(relPath: string): string | null {
  try {
    const gitFile = readFileSync(join(process.cwd(), relPath, '.git'), 'utf8');
    const rawDir = gitFile.replace('gitdir:', '').trim();
    const rawGitDir = isAbsolute(rawDir) ? rawDir : join(process.cwd(), relPath, rawDir);
    // Shallow submodule gitdirs delegate shared refs via a `commondir` file.
    let gitDir = rawGitDir;
    try {
      const common = readFileSync(join(rawGitDir, 'commondir'), 'utf8').trim();
      gitDir = isAbsolute(common) ? common : join(rawGitDir, common);
    } catch { /* single gitdir — fine */ }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head || null;
    const ref = head.slice(5);
    try {
      return readFileSync(join(gitDir, ref), 'utf8').trim() || null;
    } catch { /* fall through to packed-refs */ }
    try {
      const packed = readFileSync(join(gitDir, 'packed-refs'), 'utf8');
      for (const line of packed.split('\n')) {
        const [sha, name] = line.split(' ');
        if (name === ref && sha) return sha.trim();
      }
    } catch { /* no packed-refs */ }
    return null;
  } catch {
    return null;
  }
}

/** Manifest enriched with live checkout/env state (honest: un-cloned submodules report present:false). */
export function getAutomationProviders(): AutomationProvider[] {
  return loadManifest().map((p) => ({
    ...p,
    present: existsSync(join(process.cwd(), p.path, '.git')),
    commit: submoduleCommit(p.path),
    configuredEnv: (p.env ?? []).filter((name) => Boolean(process.env[name])),
  }));
}
