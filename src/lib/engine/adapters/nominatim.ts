import { engineFetch, recordProviderUsage } from '../http';

// ─── OSM Nominatim geocoding — VERIFIED WORKING (200) from sandbox ──
// Rate limit: max 1 req/s (documented), UA with contact mandatory.

let lastCall = 0;

async function throttle(): Promise<void> {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

export interface GeoResult {
  lat: number;
  lon: number;
  displayName: string;
  type?: string;
  countryCode?: string;
}

export async function geocode(
  q: string,
  opts: { countryCode?: string; clientId?: string | null } = {},
): Promise<{ status: string; results: GeoResult[]; error?: string }> {
  await throttle();
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '3',
    addressdetails: '1',
  });
  if (opts.countryCode) params.set('countrycodes', opts.countryCode.toLowerCase());
  const res = await engineFetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    timeoutMs: 15000,
    retries: 1,
  });
  await recordProviderUsage('osm_nominatim', opts.clientId ?? null);

  if (!res.ok || !res.data) {
    return { status: res.status === 429 ? 'rate_limited' : res.status === 0 ? 'blocked_here' : 'failing', results: [], error: res.error };
  }
  try {
    const arr = JSON.parse(res.data) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      type?: string;
      address?: { country_code?: string };
    }>;
    return {
      status: 'verified',
      results: arr.map(a => ({
        lat: Number(a.lat),
        lon: Number(a.lon),
        displayName: a.display_name,
        type: a.type,
        countryCode: a.address?.country_code?.toUpperCase(),
      })),
    };
  } catch {
    return { status: 'failing', results: [], error: 'parse error' };
  }
}

export async function verifyNominatim(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await geocode('Dhaka');
  return {
    status: r.status === 'verified' && r.results.length ? 'verified' : r.status,
    check: { probe: 'q=Dhaka', results: r.results.length, sample: r.results[0]?.displayName ?? null },
  };
}
