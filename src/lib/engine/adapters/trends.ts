import { engineFetch, parseXmlTag, recordProviderUsage } from '../http';

// ─── Google Trends public RSS — VERIFIED WORKING (200) from sandbox ─

export interface TrendItem {
  title: string;
  approxTraffic?: string;
  pubDate?: string;
  newsUrl?: string;
}

export async function fetchTrends(
  geo: string,
  clientId: string | null = null,
): Promise<{ status: string; items: TrendItem[]; error?: string }> {
  const url = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo.toUpperCase())}`;
  const res = await engineFetch(url, { timeoutMs: 15000, retries: 1, accept: 'application/rss+xml' });
  await recordProviderUsage('google_trends', clientId);

  if (!res.ok || !res.data) {
    return { status: res.status === 429 ? 'rate_limited' : res.status === 0 ? 'blocked_here' : 'failing', items: [], error: res.error };
  }
  const items: TrendItem[] = [];
  const itemBlocks = res.data.split('<item>').slice(1);
  for (const block of itemBlocks) {
    const title = parseXmlTag(`<root>${block}</root>`, 'title')[0];
    if (!title) continue;
    const traffic = parseXmlTag(`<root>${block}</root>`, 'ht:approx_traffic')[0];
    const pubDate = parseXmlTag(`<root>${block}</root>`, 'pubDate')[0];
    const newsUrl = parseXmlTag(`<root>${block}</root>`, 'ht:news_item_url')[0];
    items.push({ title, approxTraffic: traffic || undefined, pubDate, newsUrl });
  }
  return { status: items.length ? 'verified' : 'failing', items };
}

export async function verifyTrends(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await fetchTrends('BD');
  return {
    status: r.status === 'verified' ? 'verified' : r.status,
    check: { probe: 'geo=BD', items: r.items.length, sample: r.items[0]?.title ?? null },
  };
}
