import { engineFetch, recordProviderUsage } from '../http';

// ─── Wikimedia Pageviews — topic-demand signal. Reachable but 429
// rate-limited from datacenter IPs at probe time; honest handling. ────

export interface PageviewPoint {
  date: string; // YYYY-MM-DD
  views: number;
}

export async function pageviewsPerArticle(
  project: string,
  article: string,
  opts: { days?: number; clientId?: string | null } = {},
): Promise<{ status: string; points: PageviewPoint[]; error?: string }> {
  const days = opts.days ?? 30;
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2); // API lags ~2 days
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

  const url =
    `https://api.wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `${project}/all-access/user/${encodeURIComponent(article.replace(/ /g, '_'))}/daily/${fmt(start)}/${fmt(end)}`;
  const res = await engineFetch(url, { timeoutMs: 20000, retries: 1 });
  await recordProviderUsage('wikimedia_pageviews', opts.clientId ?? null);

  if (!res.ok || !res.data) {
    return { status: res.status === 429 ? 'rate_limited' : res.status === 0 ? 'blocked_here' : 'failing', points: [], error: res.error };
  }
  try {
    const json = JSON.parse(res.data) as { items?: { timestamp: string; views: number }[] };
    return {
      status: 'verified',
      points: (json.items ?? []).map(i => ({
        date: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`,
        views: i.views,
      })),
    };
  } catch {
    return { status: 'failing', points: [], error: 'parse error' };
  }
}

export async function verifyWikimedia(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await pageviewsPerArticle('en.wikipedia', 'Study abroad', { days: 7 });
  return {
    status: r.status === 'verified' ? 'verified' : r.status,
    check: {
      probe: 'en.wikipedia "Study abroad" 7d',
      points: r.points.length,
      note: r.status === 'rate_limited' ? 'reachable; 429 backoff needed' : undefined,
    },
  };
}
