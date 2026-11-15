import type { CredentialField, PlatformTemplate } from './platform-types';
import { PLATFORMS_A } from './platforms-a';
import { PLATFORMS_B } from './platforms-b';

export type { CredentialField, PlatformTemplate };

export const PLATFORM_TEMPLATES: PlatformTemplate[] = [...PLATFORMS_A, ...PLATFORMS_B];

const TEMPLATE_MAP: Record<string, PlatformTemplate> = Object.fromEntries(
  PLATFORM_TEMPLATES.map(p => [p.key, p])
);

export function getTemplate(key: string): PlatformTemplate | undefined {
  return TEMPLATE_MAP[key];
}

export function isFieldRequired(field: CredentialField): boolean {
  return field.required !== false;
}

export interface EntryLite {
  platform: string;
  fieldKey: string;
  status: string;
}

/** Overall completion stats across the client's assigned platforms */
export function computeProgress(platforms: string[], entries: EntryLite[]) {
  const entryMap = new Map(entries.map(e => [`${e.platform}:${e.fieldKey}`, e]));
  let total = 0;
  let collected = 0;
  let skipped = 0;
  let pending = 0;

  const perPlatform: Record<string, { total: number; collected: number; skipped: number; pending: number }> = {};

  for (const pKey of platforms) {
    const tpl = TEMPLATE_MAP[pKey];
    if (!tpl) continue;
    perPlatform[pKey] = { total: 0, collected: 0, skipped: 0, pending: 0 };
    for (const f of tpl.fields) {
      const entry = entryMap.get(`${pKey}:${f.key}`);
      const st = entry?.status ?? 'pending';
      perPlatform[pKey].total += 1;
      total += 1;
      if (st === 'collected') {
        perPlatform[pKey].collected += 1;
        collected += 1;
      } else if (st === 'skipped') {
        perPlatform[pKey].skipped += 1;
        skipped += 1;
      } else {
        perPlatform[pKey].pending += 1;
        pending += 1;
      }
    }
  }

  const done = collected + skipped;
  return {
    total,
    collected,
    skipped,
    pending,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    perPlatform,
  };
}
