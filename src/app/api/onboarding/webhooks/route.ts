import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  ingestVerifiedWebhookEvent,
  runWebhookSignatureSelfTest,
  verifyWebhookChallenge,
  type WebhookSignatureScheme,
} from '@/lib/onboarding/webhooks';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const hubMode = req.nextUrl.searchParams.get('hub.mode');
  const hubVerifyToken = req.nextUrl.searchParams.get('hub.verify_token');
  const hubChallenge = req.nextUrl.searchParams.get('hub.challenge');
  const expectedVerifyToken = req.nextUrl.searchParams.get('expectedToken') || process.env.ALOAPI_WEBHOOK_VERIFY_TOKEN || '';

  if (hubMode) {
    const out = verifyWebhookChallenge({
      scheme: 'meta_subscribe',
      hubMode,
      hubVerifyToken,
      hubChallenge,
      expectedVerifyToken,
    });
    if (!out.ok) return NextResponse.json({ error: out.reason }, { status: out.statusCode });
    return new NextResponse(out.challengeEcho || '', { status: 200 });
  }

  return NextResponse.json({ ok: true, verifier: 'ready' });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'self_test');
  if (action === 'challenge') {
    const res = verifyWebhookChallenge({
      scheme: (body.scheme ? String(body.scheme) : 'slack_url_verification') as 'meta_subscribe' | 'slack_url_verification' | 'generic_challenge',
      hubMode: body.hubMode ? String(body.hubMode) : undefined,
      hubVerifyToken: body.hubVerifyToken ? String(body.hubVerifyToken) : undefined,
      hubChallenge: body.hubChallenge ? String(body.hubChallenge) : undefined,
      expectedVerifyToken: body.expectedVerifyToken ? String(body.expectedVerifyToken) : undefined,
      bodyType: body.type ? String(body.type) : undefined,
      bodyChallenge: body.challenge ? String(body.challenge) : undefined,
    });
    return NextResponse.json(res, { status: res.statusCode });
  }

  const tenantId = String(body.tenantId || '').trim();
  const providerKey = String(body.providerKey || '').trim();
  const scheme = String(body.scheme || 'generic_hmac_sha256') as WebhookSignatureScheme;
  const payloadRaw = typeof body.payloadRaw === 'string' ? body.payloadRaw : JSON.stringify(body.payload ?? { test: true });

  if (!tenantId || !providerKey) {
    return NextResponse.json({ error: 'tenantId and providerKey are required.' }, { status: 400 });
  }

  try {
    if (action === 'ingest') {
      const out = await ingestVerifiedWebhookEvent({
        tenantId,
        providerKey,
        scheme,
        payloadRaw,
        signatureHeader: String(body.signatureHeader || ''),
        timestampHeader: body.timestampHeader ? String(body.timestampHeader) : undefined,
        method: body.method ? String(body.method) : 'POST',
        requestUri: body.requestUri ? String(body.requestUri) : undefined,
        eventId: body.eventId ? String(body.eventId) : undefined,
        secretOverride: body.testSecret ? String(body.testSecret) : undefined,
        actor: guard.user.username,
      });
      return NextResponse.json(out, { status: out.statusCode });
    }

    const out = await runWebhookSignatureSelfTest({
      tenantId,
      providerKey,
      scheme,
      payloadRaw,
      signatureHeader: body.signatureHeader ? String(body.signatureHeader) : undefined,
      timestampHeader: body.timestampHeader ? String(body.timestampHeader) : undefined,
      testSecret: body.testSecret ? String(body.testSecret) : undefined,
      actor: guard.user.username,
    });

    await dispatchOmniEvent({
      tenantId,
      eventType: 'webhook.received',
      providerKey,
      sourceChannel: 'webhook_verifier',
      payload: { scheme, valid: out.verified, source: out.source },
      actor: guard.user.username,
    }).catch(() => undefined);

    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Webhook test failed.' }, { status: 400 });
  }
}
