import type { NextRequest } from 'next/server';

// Next's standalone URL can use localhost internally even when the browser used
// 127.0.0.1. Select among configured origins; never echo an arbitrary Host.
export function callbackUrl(req: NextRequest) {
  const port = process.env.PORT || process.env.ALOAPI_PORT || '47831';
  const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  if (process.env.ALOAPI_PUBLIC_WEBHOOK_BASE_URL)
    origins.push(new URL(process.env.ALOAPI_PUBLIC_WEBHOOK_BASE_URL).origin);
  const origin = origins.find((o) => new URL(o).host === req.headers.get('host'));
  if (!origin) throw new Error('Unregistered callback origin.');
  return `${origin}/api/onboarding/oauth/callback`;
}
