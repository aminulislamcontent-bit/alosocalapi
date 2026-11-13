import type { SbCategory, SbPlatform } from './types';
import { CAT_ECOMMERCE } from './cat1-ecommerce';
import { CAT_SOCIAL } from './cat2-social';
import { CAT_VIDEO } from './cat3-video';
import { CAT_SEO } from './cat4-seo';
import { CAT_PAYMENT } from './cat5-payments';
import { CAT_LOGISTICS } from './cat6-logistics';
import { CAT_CRM } from './cat7-crm';
import { CAT_CONTENT } from './cat8-content';
import { CAT_WEBHOOK } from './cat9-webhook';

/** All 10 SetupBot categories in menu order (Phase 1.0 dynamic menu) */
export const SB_CATEGORIES: SbCategory[] = [
  CAT_ECOMMERCE,
  CAT_SOCIAL,
  CAT_VIDEO,
  CAT_SEO,
  CAT_PAYMENT,
  CAT_LOGISTICS,
  CAT_CRM,
  CAT_CONTENT,
  CAT_WEBHOOK,
];

export const SB_TOTAL_PLATFORMS = SB_CATEGORIES.reduce((n, c) => n + c.platforms.length, 0);
export const SB_TOTAL_FIELDS = SB_CATEGORIES.reduce(
  (n, c) => n + c.platforms.reduce((m, p) => m + p.fields.length, 0),
  0
);

/** Map platform key → its category */
const platformIndex = new Map<string, { cat: SbCategory; plat: SbPlatform }>();
for (const cat of SB_CATEGORIES) {
  for (const plat of cat.platforms) {
    if (!platformIndex.has(plat.key)) platformIndex.set(plat.key, { cat, plat });
  }
}

export function getSbPlatform(key: string): SbPlatform | undefined {
  return platformIndex.get(key)?.plat;
}

export function getSbCategoryOf(platformKey: string): SbCategory | undefined {
  return platformIndex.get(platformKey)?.cat;
}

/** Category → platform key list (used by the export bucket builder) */
export function platformsOfCategory(catKey: string): SbPlatform[] {
  return SB_CATEGORIES.find(c => c.key === catKey)?.platforms ?? [];
}

export type { SbCategory, SbPlatform, SbField } from './types';
export { SB_VERSION, EXPORT_BUCKETS, TOKEN_REFRESH_SCHEDULE } from './types';
