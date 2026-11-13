import { engineFetch, recordProviderUsage } from '../http';

// ─── PageSpeed Insights — official API, no key at low volume.
// Reachable but rate-limited (429) from datacenter IPs at probe time. ─

export interface PsiResult {
  status: string;
  scores?: {
    performance?: number;
    seo?: number;
    accessibility?: number;
    bestPractices?: number;
  };
  audits?: Record<string, { score?: number | null; title?: string; displayValue?: string }>;
  error?: string;
}

export async function runPsi(
  url: string,
  clientId: string | null = null,
): Promise<PsiResult> {
  const api =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}` +
    `&category=performance&category=seo&category=accessibility&category=best-practices`;
  const res = await engineFetch(api, { timeoutMs: 60000, retries: 1 });
  await recordProviderUsage('pagespeed_insights', clientId);

  if (!res.ok || !res.data) {
    return { status: res.status === 429 ? 'rate_limited' : res.status === 0 ? 'blocked_here' : 'failing', error: res.error };
  }
  try {
    const json = JSON.parse(res.data) as {
      lighthouseResult?: {
        categories?: Record<string, { score?: number }>;
        audits?: Record<string, { score?: number | null; title?: string; displayValue?: string }>;
      };
    };
    const lr = json.lighthouseResult;
    if (!lr?.categories) return { status: 'failing', error: 'no lighthouse result' };
    return {
      status: 'verified',
      scores: {
        performance: lr.categories['performance']?.score != null ? lr.categories['performance'].score! * 100 : undefined,
        seo: lr.categories['seo']?.score != null ? lr.categories['seo'].score! * 100 : undefined,
        accessibility: lr.categories['accessibility']?.score != null ? lr.categories['accessibility'].score! * 100 : undefined,
        bestPractices: lr.categories['best-practices']?.score != null ? lr.categories['best-practices'].score! * 100 : undefined,
      },
      audits: lr.audits ?? {},
    };
  } catch {
    return { status: 'failing', error: 'parse error' };
  }
}

export async function verifyPsi(): Promise<{ status: string; check: Record<string, unknown> }> {
  const r = await runPsi('https://example.com');
  return {
    status: r.status === 'verified' ? 'verified' : r.status,
    check: {
      probe: 'example.com',
      scores: r.scores ?? null,
      note: r.status === 'rate_limited' ? 'reachable but IP rate-limited — works with key/quota' : undefined,
    },
  };
}
