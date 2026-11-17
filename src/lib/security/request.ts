import { NextRequest } from 'next/server';

/** Reject cross-origin browser mutations while permitting same-origin and non-browser local clients. */
export function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    const parsed = new URL(origin);
    const host = req.headers.get('host');
    const forwardedHost = process.env.ALOAPI_TRUST_PROXY === 'true'
      ? req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
      : undefined;
    const expectedHosts = [host, forwardedHost].filter(Boolean).map(value => value!.toLowerCase());
    return Boolean(expectedHosts.includes(parsed.host.toLowerCase()) && (parsed.protocol === 'https:' || parsed.protocol === 'http:'));
  } catch {
    return false;
  }
}

export function isSecureRequest(req: NextRequest): boolean {
  if (req.nextUrl.protocol === 'https:') return true;
  if (process.env.ALOAPI_TRUST_PROXY === 'true') {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    if (proto === 'https') return true;
  }
  return false;
}
