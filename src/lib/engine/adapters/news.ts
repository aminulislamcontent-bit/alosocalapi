import { engineFetch, parseXmlTag, recordProviderUsage } from '../http';

// ─── Google News RSS search — VERIFIED WORKING (200) from sandbox ───
// Headlines are used for research/attribution with links to publishers.

export interface NewsItem {
  title: string;
  link: string;
  pubDate?: string;
  source?: string;
}

export async function searchNews(
  query: string,
  opts: { gl?: string; hl?: string; clientId?: string | null } = {},
): Promise<{ status: string; items: NewsItem[]; error?: string }> {
  const gl = (opts.gl ?? 'US').toUpperCase();
  const hl = opts.hl ?? 'en';
  const ceid = `${gl}:${hl}`;
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=${encodeURIComponent(hl)}&gl=${gl}&ceid=${encodeURIComponent(ceid)}`;
  const res = await engineFetch(url, { timeoutMs: 15000, retries: 1, accept: 'application/rss+xml' });
  await recordProviderUsage('google_news_rss', opts.clientId ?? null);

  if (!res.ok || !res.data) {
    return { status: res.status === 429 ? 'rate_limited' : res.status === 0 ? 'blocked_here' : 'failing', items: [], error: res.error };
  }
  const items: NewsItem[] = [];
  for (const block of res.data.split('<item>').slice(1)) {
    const wrap = `<root>${block.split('</item>')[0]}</root>`;
    const title = parseXmlTag(wrap, 'title')[0];
    const link = parseXmlTag(wrap, 'link')[0];
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate: parseXmlTag(wrap, 'pubDate')[0],
      source: parseXmlTag(wrap, 'source')[0] || undefined,
    });
  }
  return { status: items.length ? 'verified' : 'failing', items: items.slice(0, 25) };
}

export async function verifyNews(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await searchNews('business', { gl: 'US' });
  return {
    status: r.status === 'verified' ? 'verified' : r.status,
    check: { probe: 'q=business gl=US', items: r.items.length, sample: r.items[0]?.title ?? null },
  };
}
