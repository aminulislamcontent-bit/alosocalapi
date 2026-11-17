import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { resolveVaultSecretForServer } from './vault-service';
import { dispatchOmniEvent } from './omni-routing';
import { auditEvent } from '@/lib/security/audit';

export type WebhookSignatureScheme =
  | 'meta_hmac_sha256'
  | 'shopify_hmac_sha256'
  | 'stripe_signature'
  | 'slack_v0'
  | 'hubspot_v3'
  | 'generic_hmac_sha256';

export interface VerifyWebhookInput {
  scheme: WebhookSignatureScheme;
  payloadRaw: string;
  signatureHeader: string;
  secret: string;
  timestampHeader?: string;
  method?: string;
  requestUri?: string;
  toleranceSeconds?: number;
}

export interface VerifyWebhookResult {
  valid: boolean;
  scheme: WebhookSignatureScheme;
  reason: string;
  computedPreview: string;
}

function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function verifyWebhookSignature(input: VerifyWebhookInput): VerifyWebhookResult {
  const secret = input.secret || '';
  const sigHeader = (input.signatureHeader || '').trim();
  if (!secret || !sigHeader) {
    return {
      valid: false,
      scheme: input.scheme,
      reason: 'Missing webhook signing secret or signature header.',
      computedPreview: 'unavailable',
    };
  }

  const tolerance = input.toleranceSeconds ?? 300;
  const nowSec = Math.floor(Date.now() / 1000);

  if (input.scheme === 'meta_hmac_sha256' || input.scheme === 'generic_hmac_sha256') {
    const digest = createHmac('sha256', secret).update(input.payloadRaw, 'utf8').digest('hex');
    const expected = `sha256=${digest}`;
    const candidate = sigHeader.startsWith('sha256=') ? sigHeader : `sha256=${sigHeader}`;
    const valid = safeCompareStrings(candidate.toLowerCase(), expected.toLowerCase());
    return {
      valid,
      scheme: input.scheme,
      reason: valid ? 'HMAC-SHA256 digest verified cleanly.' : 'HMAC-SHA256 signature mismatch.',
      computedPreview: `sha256=${digest.slice(0, 8)}...`,
    };
  }

  if (input.scheme === 'shopify_hmac_sha256') {
    const expected = createHmac('sha256', secret).update(input.payloadRaw, 'utf8').digest('base64');
    const valid = safeCompareStrings(sigHeader, expected);
    return {
      valid,
      scheme: input.scheme,
      reason: valid ? 'Shopify Base64 HMAC-SHA256 verified.' : 'Shopify HMAC signature mismatch.',
      computedPreview: `${expected.slice(0, 8)}...`,
    };
  }

  if (input.scheme === 'slack_v0') {
    const ts = (input.timestampHeader || '').trim();
    const tsNum = Number(ts);
    if (!ts || !Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > tolerance) {
      return {
        valid: false,
        scheme: input.scheme,
        reason: 'Missing or expired X-Slack-Request-Timestamp outside replay tolerance.',
        computedPreview: 'timestamp_rejected',
      };
    }
    const baseString = `v0:${ts}:${input.payloadRaw}`;
    const expected = `v0=${createHmac('sha256', secret).update(baseString, 'utf8').digest('hex')}`;
    const valid = safeCompareStrings(sigHeader.toLowerCase(), expected.toLowerCase());
    return {
      valid,
      scheme: input.scheme,
      reason: valid ? 'Slack v0 HMAC-SHA256 + replay window verified.' : 'Slack v0 signature mismatch.',
      computedPreview: `${expected.slice(0, 11)}...`,
    };
  }

  if (input.scheme === 'stripe_signature') {
    const parts = Object.fromEntries(
      sigHeader.split(',').map(kv => {
        const idx = kv.indexOf('=');
        return idx > 0 ? [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()] : ['', ''];
      }),
    );
    const tsNum = Number(parts.t);
    if (!parts.t || !parts.v1 || !Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > tolerance) {
      return {
        valid: false,
        scheme: input.scheme,
        reason: 'Missing t/v1 or Stripe signature timestamp outside replay tolerance.',
        computedPreview: 'timestamp_rejected',
      };
    }
    const signedPayload = `${parts.t}.${input.payloadRaw}`;
    const expected = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    const valid = safeCompareStrings(parts.v1.toLowerCase(), expected.toLowerCase());
    return {
      valid,
      scheme: input.scheme,
      reason: valid ? 'Stripe v1 HMAC-SHA256 + timestamp verified.' : 'Stripe v1 signature mismatch.',
      computedPreview: `v1=${expected.slice(0, 8)}...`,
    };
  }

  // hubspot_v3
  const ts = (input.timestampHeader || '').trim();
  const tsNum = Number(ts);
  if (!ts || !Number.isFinite(tsNum)) {
    return {
      valid: false,
      scheme: input.scheme,
      reason: 'Missing X-HubSpot-Request-Timestamp.',
      computedPreview: 'timestamp_rejected',
    };
  }
  const tsSec = tsNum > 1e12 ? Math.floor(tsNum / 1000) : tsNum;
  if (Math.abs(nowSec - tsSec) > tolerance) {
    return {
      valid: false,
      scheme: input.scheme,
      reason: 'HubSpot timestamp outside replay tolerance.',
      computedPreview: 'timestamp_rejected',
    };
  }
  const sourceStr = `${(input.method || 'POST').toUpperCase()}${input.requestUri || '/api/webhooks'}${input.payloadRaw}${ts}`;
  const expected = createHmac('sha256', secret).update(sourceStr, 'utf8').digest('base64');
  const valid = safeCompareStrings(sigHeader, expected);
  return {
    valid,
    scheme: input.scheme,
    reason: valid ? 'HubSpot v3 signature verified.' : 'HubSpot v3 signature mismatch.',
    computedPreview: `${expected.slice(0, 8)}...`,
  };
}

export async function runWebhookSignatureSelfTest(params: {
  tenantId: string;
  providerKey: string;
  scheme: WebhookSignatureScheme;
  payloadRaw: string;
  signatureHeader?: string;
  timestampHeader?: string;
  testSecret?: string;
  actor: string;
}) {
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error('Unknown providerKey.');

  let activeSecret = params.testSecret || '';
  let source = 'operator_ephemeral_test_secret';

  if (!activeSecret) {
    const stored = await resolveVaultSecretForServer({
      tenantId: params.tenantId,
      providerKey: params.providerKey,
      credentialType: 'webhook_secret',
      actor: params.actor,
      reason: 'Verify incoming webhook signature against Vault webhook_secret',
    });
    if (stored) {
      activeSecret = stored.plaintext;
      source = 'encrypted_vault_webhook_secret';
    }
  }

  if (!activeSecret) {
    return {
      verified: false,
      source: 'none',
      result: {
        valid: false,
        scheme: params.scheme,
        reason: 'No webhook_secret stored in Vault and no ephemeral testSecret supplied.',
        computedPreview: 'unavailable',
      },
    };
  }

  let effectiveSig = params.signatureHeader || '';
  let effectiveTs = params.timestampHeader || '';
  if (!effectiveSig) {
    const nowSec = String(Math.floor(Date.now() / 1000));
    effectiveTs = effectiveTs || nowSec;
    if (params.scheme === 'meta_hmac_sha256' || params.scheme === 'generic_hmac_sha256') {
      effectiveSig = `sha256=${createHmac('sha256', activeSecret).update(params.payloadRaw, 'utf8').digest('hex')}`;
    } else if (params.scheme === 'shopify_hmac_sha256') {
      effectiveSig = createHmac('sha256', activeSecret).update(params.payloadRaw, 'utf8').digest('base64');
    } else if (params.scheme === 'slack_v0') {
      effectiveSig = `v0=${createHmac('sha256', activeSecret).update(`v0:${effectiveTs}:${params.payloadRaw}`, 'utf8').digest('hex')}`;
    } else if (params.scheme === 'stripe_signature') {
      effectiveSig = `t=${effectiveTs},v1=${createHmac('sha256', activeSecret).update(`${effectiveTs}.${params.payloadRaw}`, 'utf8').digest('hex')}`;
    } else {
      effectiveSig = createHmac('sha256', activeSecret).update(`POST/api/webhooks${params.payloadRaw}${effectiveTs}`, 'utf8').digest('base64');
    }
  }

  const result = verifyWebhookSignature({
    scheme: params.scheme,
    payloadRaw: params.payloadRaw,
    signatureHeader: effectiveSig,
    timestampHeader: effectiveTs,
    secret: activeSecret,
  });

  await auditEvent({
    actor: params.actor,
    action: 'webhook.signature.verify',
    target: `${params.tenantId}:${params.providerKey}`,
    providerKey: params.providerKey,
    metadata: { scheme: params.scheme, valid: result.valid, source },
  });

  return { verified: result.valid, source, result };
}

export function verifyWebhookChallenge(params: {
  scheme: 'meta_subscribe' | 'slack_url_verification' | 'generic_challenge';
  hubMode?: string | null;
  hubVerifyToken?: string | null;
  hubChallenge?: string | null;
  expectedVerifyToken?: string;
  bodyType?: string;
  bodyChallenge?: string;
}): { ok: boolean; statusCode: number; challengeEcho?: string; reason: string } {
  if (params.scheme === 'meta_subscribe') {
    if (params.hubMode !== 'subscribe' || !params.hubChallenge) {
      return { ok: false, statusCode: 400, reason: 'Invalid hub.mode or missing hub.challenge.' };
    }
    if (!params.expectedVerifyToken || !params.hubVerifyToken) {
      return { ok: false, statusCode: 403, reason: 'Verify token missing.' };
    }
    const valid = safeCompareStrings(params.hubVerifyToken, params.expectedVerifyToken);
    return valid
      ? { ok: true, statusCode: 200, challengeEcho: params.hubChallenge, reason: 'Meta webhook challenge verified.' }
      : { ok: false, statusCode: 403, reason: 'Meta hub.verify_token mismatch.' };
  }
  if (params.scheme === 'slack_url_verification') {
    if (params.bodyType === 'url_verification' && params.bodyChallenge) {
      return { ok: true, statusCode: 200, challengeEcho: params.bodyChallenge, reason: 'Slack URL verification challenge accepted.' };
    }
    return { ok: false, statusCode: 400, reason: 'Not a valid Slack url_verification payload.' };
  }
  if (params.bodyChallenge) {
    return { ok: true, statusCode: 200, challengeEcho: params.bodyChallenge, reason: 'Generic challenge echoed.' };
  }
  return { ok: false, statusCode: 400, reason: 'Missing challenge parameter.' };
}

export async function ingestVerifiedWebhookEvent(params: {
  tenantId: string;
  providerKey: string;
  scheme: WebhookSignatureScheme;
  payloadRaw: string;
  signatureHeader: string;
  timestampHeader?: string;
  method?: string;
  requestUri?: string;
  eventId?: string;
  secretOverride?: string;
  actor: string;
}) {
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error('Unknown providerKey.');

  let signingSecret = params.secretOverride || '';
  let secretSource: 'vault' | 'override' | 'none' = params.secretOverride ? 'override' : 'none';
  if (!signingSecret) {
    const stored =
      (await resolveVaultSecretForServer({
        tenantId: params.tenantId,
        providerKey: params.providerKey,
        credentialType: 'webhook_signing_secret',
        actor: params.actor,
        reason: 'Verify inbound webhook payload',
      })) ||
      (await resolveVaultSecretForServer({
        tenantId: params.tenantId,
        providerKey: params.providerKey,
        credentialType: 'webhook_secret',
        actor: params.actor,
        reason: 'Verify inbound webhook payload',
      }));
    if (stored) {
      signingSecret = stored.plaintext;
      secretSource = 'vault';
    }
  }

  if (!signingSecret) {
    return {
      accepted: false,
      statusCode: 401,
      deduplicated: false,
      reason: 'No webhook signing secret configured in Vault for this tenant/provider.',
    };
  }

  const verification = verifyWebhookSignature({
    scheme: params.scheme,
    payloadRaw: params.payloadRaw,
    signatureHeader: params.signatureHeader,
    timestampHeader: params.timestampHeader,
    method: params.method,
    requestUri: params.requestUri,
    secret: signingSecret,
  });

  if (!verification.valid) {
    await auditEvent({
      actor: params.actor,
      action: 'webhook.ingest.rejected',
      target: `${params.tenantId}:${params.providerKey}`,
      providerKey: params.providerKey,
      metadata: { scheme: params.scheme, reason: verification.reason },
    });
    return {
      accepted: false,
      statusCode: 401,
      deduplicated: false,
      verification,
      reason: verification.reason,
    };
  }

  const parsedPayload = (() => {
    try { return JSON.parse(params.payloadRaw) as Record<string, unknown>; } catch { return { raw: params.payloadRaw }; }
  })();
  const dedupeSeed = params.eventId
    ? `${params.tenantId}:${params.providerKey}:${params.eventId}`
    : `${params.tenantId}:${params.providerKey}:${params.payloadRaw}`;
  const dedupeKey = `wh_${createHash('sha256').update(dedupeSeed, 'utf8').digest('hex').slice(0, 40)}`;

  const queued = await dispatchOmniEvent({
    tenantId: params.tenantId,
    eventType: 'webhook.received',
    providerKey: params.providerKey,
    sourceChannel: 'provider_webhook',
    payload: parsedPayload,
    idempotencyKey: dedupeKey,
    actor: params.actor,
  });

  await auditEvent({
    actor: params.actor,
    action: queued.deduplicated ? 'webhook.ingest.replay_deduplicated' : 'webhook.ingest.accepted',
    target: `${params.tenantId}:${params.providerKey}`,
    providerKey: params.providerKey,
    metadata: { scheme: params.scheme, dedupeKey, deduplicated: queued.deduplicated, secretSource },
  });

  return {
    accepted: true,
    statusCode: 200,
    deduplicated: queued.deduplicated,
    dedupeKey,
    secretSource,
    verification,
    event: queued.event,
    reason: queued.deduplicated ? 'Idempotent replay detected; existing processed webhook event returned.' : 'Webhook verified and queued.',
  };
}

