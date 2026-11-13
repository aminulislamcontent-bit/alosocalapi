import { createHash } from 'crypto';

// ─── Deterministic dedupe fingerprints (§8) ─────────────────────────

export function normalizeDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = u.host.replace(/^www\./, '').toLowerCase();
    return host || null;
  } catch {
    const bare = url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    return bare || null;
  }
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u0980-\u09FF]+/g, w => w) // keep Bengali words as-is
    .replace(/(ltd|limited|llc|inc|pvt|private|co\bd?|company|corporation|group)\b\.?/g, '')
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, '')
    .trim();
}

/**
 * fingerprint — stable identity for dedupe:
 *   1. website domain when available (strongest signal)
 *   2. normalized name + city otherwise
 */
export function leadFingerprint(input: {
  name: string;
  website?: string | null;
  city?: string | null;
}): string {
  const domain = normalizeDomain(input.website);
  if (domain) return sha1(`domain:${domain}`);
  return sha1(`name:${normalizeName(input.name)}|city:${(input.city ?? '').toLowerCase().trim()}`);
}

export function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

export function tokenOverlap(a: string, b: string): number {
  const norm = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\u0980-\u09FF\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2),
    );
  const A = norm(a);
  const B = norm(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}
