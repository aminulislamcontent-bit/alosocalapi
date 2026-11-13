import { engineFetch, recordProviderUsage } from '../http';

// ─── Reddit public JSON — public discussion signal.
// 403 for datacenter IPs without OAuth at probe time → honest status.
// With tenant-provided OAuth credentials this adapter upgrades. ───────

export interface RedditPost {
  title: string;
  subreddit: string;
  permalink: string;
  createdUtc?: string;
}

export async function fetchSubPosts(
  subreddit: string,
  opts: { limit?: number; clientId?: string | null; oauthToken?: string } = {},
): Promise<{ status: string; posts: RedditPost[]; error?: string }> {
  const limit = Math.min(opts.limit ?? 15, 25);
  const headers: Record<string, string> = {};
  if (opts.oauthToken) headers['Authorization'] = `Bearer ${opts.oauthToken}`;

  const res = await engineFetch(
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?limit=${limit}`,
    { timeoutMs: 15000, retries: 0, headers },
  );
  await recordProviderUsage('reddit_public', opts.clientId ?? null);

  if (!res.ok || !res.data) {
    return {
      status: res.status === 403 ? 'blocked_here' : res.status === 429 ? 'rate_limited' : res.status === 0 ? 'blocked_here' : 'failing',
      posts: [],
      error: res.error,
    };
  }
  try {
    const json = JSON.parse(res.data) as {
      data?: { children?: { data?: Record<string, unknown> }[] };
    };
    const posts: RedditPost[] = (json.data?.children ?? [])
      .map(c => c.data as { title?: string; subreddit?: string; permalink?: string; created_utc?: number })
      .filter(d => d.title && d.permalink)
      .map(d => ({
        title: d.title!,
        subreddit: d.subreddit ?? subreddit,
        permalink: `https://www.reddit.com${d.permalink}`,
        createdUtc: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
      }));
    return { status: 'verified', posts };
  } catch {
    return { status: 'failing', posts: [], error: 'parse error' };
  }
}

export async function verifyReddit(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await fetchSubPosts('education');
  return {
    status: r.status,
    check: {
      probe: 'r/education new.json',
      posts: r.posts.length,
      error: r.error,
      note: r.status === 'blocked_here' ? 'Needs tenant Reddit OAuth app (free tier 100 qpm) — adapter supports Bearer token' : undefined,
    },
  };
}
