import { engineFetch, recordProviderUsage } from '../http';
import { sleep } from '../http';

// ─── Wikidata SPARQL — VERIFIED WORKING from sandbox (real entities
// with official websites; CC0). Primary public lead-discovery source. ─

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const BUSINESS_CLASS = 'Q4830453'; // "business"
const INDUSTRY_PROP = 'P452';
const WEBSITE_PROP = 'P856';
const COUNTRY_PROP = 'P17';
const ISO_PROP = 'P297';

let lastSparql = 0;
async function sparqlThrottle(): Promise<void> {
  const wait = 2000 - (Date.now() - lastSparql);
  if (wait > 0) await sleep(wait);
  lastSparql = Date.now();
}

export async function sparqlQuery(
  query: string,
  clientId: string | null = null,
): Promise<{ status: string; bindings: Record<string, { value: string }>[]; error?: string }> {
  await sparqlThrottle();
  const res = await engineFetch(
    `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`,
    { timeoutMs: 55000, retries: 1, accept: 'application/sparql-results+json' },
  );
  await recordProviderUsage('wikidata_sparql', clientId);

  if (!res.ok || !res.data) {
    return { status: res.status === 429 ? 'rate_limited' : res.status === 0 ? 'blocked_here' : 'failing', bindings: [], error: res.error };
  }
  try {
    const parsed = JSON.parse(res.data) as {
      results?: { bindings?: Record<string, { value: string }>[] };
    };
    return { status: 'verified', bindings: parsed.results?.bindings ?? [] };
  } catch {
    return { status: 'failing', bindings: [], error: 'parse error' };
  }
}

// ISO alpha-2 → Wikidata QID, cached for 6h
let qidCache: { map: Record<string, string>; at: number } | null = null;

export async function getCountryQidMap(
  clientId: string | null = null,
): Promise<Record<string, string>> {
  if (qidCache && Date.now() - qidCache.at < 6 * 3600_000) return qidCache.map;
  const r = await sparqlQuery(
    `SELECT ?c ?iso WHERE { ?c wdt:${ISO_PROP} ?iso . }`,
    clientId,
  );
  if (r.status !== 'verified') return qidCache?.map ?? {};
  const map: Record<string, string> = {};
  for (const b of r.bindings) {
    const iso = b.iso?.value?.toUpperCase();
    const qid = b.c?.value?.split('/').pop();
    if (iso && qid && iso.length === 2) map[iso] = qid;
  }
  qidCache = { map, at: Date.now() };
  return map;
}

export interface WikidataBusiness {
  uri: string;
  name: string;
  website: string;
  industry?: string;
  description?: string;
}

export async function searchBusinesses(opts: {
  countryCode: string;
  limit?: number;
  clientId?: string | null;
}): Promise<{ status: string; businesses: WikidataBusiness[]; error?: string }> {
  const qidMap = await getCountryQidMap(opts.clientId ?? null);
  const qid = qidMap[opts.countryCode.toUpperCase()];
  if (!qid) {
    return { status: 'verified', businesses: [], error: `no Wikidata QID for ${opts.countryCode}` };
  }
  const limit = Math.min(opts.limit ?? 25, 50);
  // NOTE: SERVICE wikibase:label times out upstream for this pattern;
  // direct rdfs:label binding returns in ~2s with real entity names.
  const query = `
    SELECT DISTINCT ?item ?itemLabel ?website ?indLabel WHERE {
      ?item wdt:P31/wdt:P279* wd:${BUSINESS_CLASS} ;
            wdt:${COUNTRY_PROP} wd:${qid} ;
            wdt:${WEBSITE_PROP} ?website ;
            rdfs:label ?itemLabel .
      OPTIONAL { ?item wdt:${INDUSTRY_PROP} ?ind . ?ind rdfs:label ?indLabel FILTER(LANG(?indLabel)="en") }
      FILTER(LANG(?itemLabel)="en")
    } LIMIT ${limit}`;
  const r = await sparqlQuery(query, opts.clientId ?? null);
  if (r.status !== 'verified') return { status: r.status, businesses: [], error: r.error };

  const businesses: WikidataBusiness[] = [];
  for (const b of r.bindings) {
    if (!b.itemLabel?.value || !b.website?.value) continue;
    businesses.push({
      uri: b.item.value,
      name: b.itemLabel.value,
      website: b.website.value,
      industry: b.indLabel?.value,
      description: b.desc?.value,
    });
  }
  return { status: 'verified', businesses };
}

export async function verifyWikidata(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await searchBusinesses({ countryCode: 'IN', limit: 5 });
  return {
    status: r.status === 'verified' && r.businesses.length ? 'verified' : r.status,
    check: {
      probe: 'businesses in IN with official website, LIMIT 5',
      entities: r.businesses.length,
      sample: r.businesses[0] ? `${r.businesses[0].name} — ${r.businesses[0].website}` : null,
    },
  };
}
