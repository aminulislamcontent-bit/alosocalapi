import { db } from '@/lib/db';

// ─── Shared HTTP layer for the Growth Engine ────────────────────────
// Every outbound call: identifiable UA, timeout, bounded retries with
// backoff, and usage recording (cost intelligence §13).

export const ENGINE_UA =
  'ALO-GrowthEngine/1.0 (+https://aloeducation.bd; lead-discovery-research)';

export interface FetchOutcome<T = unknown> {
  ok: boolean;
  status: number; // 0 = network unreachable
  data?: T;
  error?: string;
  attempts: number;
}

export async function engineFetch(
  url: string,
  opts: {
    timeoutMs?: number;
    headers?: Record<string, string>;
    retries?: number;
    accept?: string;
  } = {},
): Promise<FetchOutcome<string>> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = opts.retries ?? 2;
  let lastStatus = 0;
  let lastError = 'unknown';

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': ENGINE_UA,
          'Accept-Language': 'en,bn;q=0.8',
          ...(opts.accept ? { Accept: opts.accept } : {}),
          ...(opts.headers ?? {}),
        },
        redirect: 'follow',
      });
      clearTimeout(timer);
      lastStatus = res.status;
      if (res.ok) {
        const text = await res.text();
        return { ok: true, status: res.status, data: text, attempts: attempt };
      }
      // Retry only on 429 / 5xx / 408
      if (![429, 408].includes(res.status) && res.status < 500) {
        return {
          ok: false,
          status: res.status,
          error: `HTTP ${res.status}`,
          attempts: attempt,
        };
      }
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      clearTimeout(timer);
      lastStatus = 0;
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt <= retries) {
      await sleep(1000 * attempt); // linear backoff: 1s, 2s
    }
  }
  return { ok: false, status: lastStatus, error: lastError, attempts: retries + 1 };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Usage & cost tracking (Free-first §13) ─────────────────────────

export async function recordProviderUsage(
  providerKey: string,
  clientId: string | null,
  units = 1,
  unitType = 'requests',
): Promise<void> {
  await db.providerUsage.create({
    data: { providerKey, clientId, units, unitType },
  });
  const period = new Date().toISOString().slice(0, 7);
  const existing = await db.costLedger.findFirst({
    where: { providerKey, period, clientId: clientId ?? undefined },
  });
  if (existing) {
    await db.costLedger.update({
      where: { id: existing.id },
      data: { units: { increment: units } },
    });
  } else {
    await db.costLedger.create({
      data: { providerKey, period, clientId, units, estimatedUsd: 0 },
    });
  }
}

export function parseXmlTag(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(
      m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim(),
    );
  }
  return out;
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim();
}
