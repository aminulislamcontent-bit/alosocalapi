import { NextRequest } from 'next/server';

/** Reject cross-origin browser mutations while permitting same-origin and non-browser local clients. */
export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    const parsed = new URL(origin);
    const host = req.headers.get('host');
    return Boolean(host && parsed.host.toLowerCase() === host.toLowerCase() && (parsed.protocol === 'https:' || parsed.protocol === 'http:'));
  } catch {
    return false;
  }
}
