import { db } from '@/lib/db';

// ─── Taxonomy matcher: text → industry slug ─────────────────────────
// Keywords live in the DB (bilingual) so new industries work with zero
// code changes (acceptance #2).

export interface TaxonomyRow {
  slug: string;
  nameEn: string;
  nameBn: string;
  parentSlug: string | null;
  keywords: string; // JSON array
}

let cache: { rows: TaxonomyRow[]; loadedAt: number } | null = null;
const TTL_MS = 60_000;

export async function loadTaxonomy(force = false): Promise<TaxonomyRow[]> {
  if (!force && cache && Date.now() - cache.loadedAt < TTL_MS) return cache.rows;
  const rows = await db.industryTaxonomy.findMany({ where: { active: true } });
  cache = { rows: rows as TaxonomyRow[], loadedAt: Date.now() };
  return cache.rows;
}

export interface IndustryMatch {
  slug: string | null;
  nameEn: string | null;
  matchedKeywords: string[];
  strength: number; // 0..1
}

export async function matchIndustry(text: string, taxonomy?: TaxonomyRow[]): Promise<IndustryMatch> {
  const rows = taxonomy ?? (await loadTaxonomy());
  const hay = text.toLowerCase();

  let best: { slug: string; nameEn: string; hits: string[] } | null = null;
  for (const row of rows) {
    let kws: string[] = [];
    try {
      kws = JSON.parse(row.keywords) as string[];
    } catch {
      kws = [];
    }
    const hits = kws.filter(k => k && hay.includes(k.toLowerCase()));
    if (hits.length && (!best || hits.length > best.hits.length)) {
      best = { slug: row.slug, nameEn: row.nameEn, hits };
    }
  }

  if (!best) return { slug: null, nameEn: null, matchedKeywords: [], strength: 0 };
  return {
    slug: best.slug,
    nameEn: best.nameEn,
    matchedKeywords: best.hits,
    strength: Math.min(1, best.hits.length / 3),
  };
}
