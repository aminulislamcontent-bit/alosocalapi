import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { handleOAuthCallback } from '@/lib/onboarding/oauth-service';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const stateToken = req.nextUrl.searchParams.get('state') || '';
  const code = req.nextUrl.searchParams.get('code') || undefined;
  const error = req.nextUrl.searchParams.get('error') || undefined;
  const errorDescription = req.nextUrl.searchParams.get('error_description') || undefined;

  if (!stateToken) {
    return NextResponse.json({ error: 'Missing OAuth state parameter.' }, { status: 400 });
  }

  try {
    const result = await handleOAuthCallback({
      stateToken,
      redirectUri: req.nextUrl.origin + req.nextUrl.pathname,
      providerKey:req.nextUrl.searchParams.get("providerKey") || undefined, tenantId:req.nextUrl.searchParams.get("tenantId") || undefined,
      code,
      error,
      errorDescription,
      actor: guard.user.username,
      ip: guard.ip,
    });
    if (result.ok) {
      await dispatchOmniEvent({
        tenantId: result.tenantId,
        eventType: 'oauth.authorized',
        providerKey: result.providerKey,
        sourceChannel: 'oauth_redirect_callback',
        payload: { status: result.status },
        actor: guard.user.username,
      }).catch(() => undefined);
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'OAuth callback verification failed.' },
      { status: 400 },
    );
  }
}
