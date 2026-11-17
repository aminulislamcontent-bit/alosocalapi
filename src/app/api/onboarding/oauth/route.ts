import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { createOAuthAuthorizationFlow, handleOAuthCallback, revokeOAuthTokens } from '@/lib/onboarding/oauth-service';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;
  const states = await db.oAuthAuthorizationState.findMany({
    where: tenantId ? { clientId: tenantId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true,
      clientId: true,
      providerKey: true,
      redirectUri: true,
      scopes: true,
      status: true,
      expiresAt: true,
      consumedAt: true,
      errorDetail: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ states });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'create_flow');
  try {
    if (action === 'create_flow') {
      const tenantId = String(body.tenantId || '').trim();
      const providerKey = String(body.providerKey || '').trim();
      const redirectUri = String(body.redirectUri || `${req.nextUrl.origin}/api/onboarding/oauth/callback`).trim();
      if (!tenantId || !providerKey) {
        return NextResponse.json({ error: 'tenantId and providerKey are required.' }, { status: 400 });
      }
      const flow = await createOAuthAuthorizationFlow({
        tenantId,
        providerKey,
        redirectUri,
        requestedScopes: Array.isArray(body.scopes) ? body.scopes.map(String) : undefined,
        dynamicParams: (body.dynamicParams && typeof body.dynamicParams === 'object')
          ? (body.dynamicParams as Record<string, string>)
          : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(flow);
    }

    if (action === 'callback') {
      const stateToken = String(body.stateToken || body.state || '').trim();
      if (!stateToken) return NextResponse.json({ error: 'stateToken is required.' }, { status: 400 });
      const res = await handleOAuthCallback({
        stateToken,
        code: body.code ? String(body.code) : undefined,
        error: body.error ? String(body.error) : undefined,
        errorDescription: body.errorDescription ? String(body.errorDescription) : undefined,
        dynamicParams: (body.dynamicParams && typeof body.dynamicParams === 'object')
          ? (body.dynamicParams as Record<string, string>)
          : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      if (res.ok) {
        await dispatchOmniEvent({
          tenantId: res.tenantId,
          eventType: 'oauth.authorized',
          providerKey: res.providerKey,
          sourceChannel: 'oauth_callback',
          payload: { status: res.status },
          actor: guard.user.username,
        }).catch(() => undefined);
      }
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === 'revoke') {
      const tenantId = String(body.tenantId || '').trim();
      const providerKey = String(body.providerKey || '').trim();
      if (!tenantId || !providerKey) {
        return NextResponse.json({ error: 'tenantId and providerKey are required.' }, { status: 400 });
      }
      const res = await revokeOAuthTokens({
        tenantId,
        providerKey,
        reason: body.reason ? String(body.reason) : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'OAuth workflow failed.' }, { status: 400 });
  }
}
