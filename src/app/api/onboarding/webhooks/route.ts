import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { runWebhookSignatureSelfTest, type WebhookSignatureScheme } from '@/lib/onboarding/webhooks';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const tenantId = String(body.tenantId || '').trim();
  const providerKey = String(body.providerKey || '').trim();
  const scheme = String(body.scheme || 'generic_hmac_sha256') as WebhookSignatureScheme;
  const payloadRaw = typeof body.payloadRaw === 'string' ? body.payloadRaw : JSON.stringify(body.payload ?? { test: true });

  if (!tenantId || !providerKey) {
    return NextResponse.json({ error: 'tenantId and providerKey are required.' }, { status: 400 });
  }

  try {
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
