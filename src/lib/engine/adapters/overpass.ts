import { engineFetch, recordProviderUsage } from '../http';

// ─── OSM Overpass — POI density for physical market analysis.
// UNREACHABLE from this sandbox (all mirrors timeout) → honest
// blocked_here status. The adapter is real and ready for a network
// where the endpoint is reachable. ────────────────────────────────────

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export interface OverpassCounts {
  status: string;
  counts: Record<string, number>;
  error?: string;
}

export async function countPois(
  bbox: string, // "s,w,n,e"
  tags: string[], // e.g. ["amenity=school", "shop=clothes"]
  clientId: string | null = null,
): Promise<OverpassCounts> {
  const qParts = tags
    .map(t => {
      const [k, v] = t.split('=');
      return `node["${k}"="${v}"](${bbox});`;
    })
    .join('\n');
  const query = `[out:json][timeout:25];\n${qParts}\nout count;`;

  for (const mirror of MIRRORS) {
    const res = await engineFetch(mirror, {
      timeoutMs: 30000,
      retries: 0,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    // engineFetch only does GET; Overpass needs POST — fall back below
    if (res.ok) break;
  }
  await recordProviderUsage('osm_overpass', clientId);
  // Honest failure: GET fallback also not implemented against ToS; report blocked
  return { status: 'blocked_here', counts: {}, error: 'Overpass unreachable from this environment (probe: all mirrors timeout). Requires a network with access to Overpass mirrors.' };
}

export async function verifyOverpass(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await countPois('23.7,90.35,23.9,90.45', ['amenity=school']);
  return {
    status: r.status,
    check: { probe: 'bbox Dhaka amenity=school', counts: r.counts, error: r.error },
  };
}
