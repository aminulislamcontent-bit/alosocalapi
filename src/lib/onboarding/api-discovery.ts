import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { resolveVaultSecretForServer, redactSecretText } from './vault-service';
import { auditEvent } from '@/lib/security/audit';
import { transitionWorkflowState } from '@/lib/onboarding/state-machine';

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /\b(?:curl|wget|bash|sh|powershell|eval|execSync|child_process)\b\s+[^\n]+/gi,
  /rm\s+-rf\s+\//gi,
];

export function sanitizeExternalDocContent(raw: string): {
  sanitized: string;
  flaggedDirectives: string[];
} {
  const flaggedDirectives: string[] = [];
  let sanitized = raw;
  for (const pattern of INJECTION_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      for (const m of matches.slice(0, 5)) flaggedDirectives.push(m.slice(0, 120));
      sanitized = sanitized.replace(pattern, '[UNTRUSTED_DIRECTIVE_STRIPPED]');
    }
  }
  return { sanitized: redactSecretText(sanitized), flaggedDirectives };
}

export async function generateApiDiscoverySnapshot(params: {
  providerKey: string;
  externalDocExcerpt?: string;
  actor: string;
}) {
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error('Unknown provider key.');

  const docCheck = params.externalDocExcerpt ? sanitizeExternalDocContent(params.externalDocExcerpt) : { sanitized: '', flaggedDirectives: [] };

  const schemaSummary = {
    providerKey: provider.key,
    displayName: provider.displayName,
    apiVersion: provider.apiVersion,
    baseUrls: provider.apiBaseUrls,
    authenticationType: provider.authenticationType,
    oauthSupport: provider.oauthSupport,
    requiredScopes: provider.requiredScopes,
    endpoints: provider.apiSpecs,
    webhooks: provider.webhookSupport,
    rateLimitsAndPricing: provider.rateLimitsAndPricing,
    sourceUrls: provider.officialDocs.map(d => d.url),
    untrustedDocAudit: docCheck.flaggedDirectives.length
      ? { sanitizedExcerptLength: docCheck.sanitized.length, strippedDirectives: docCheck.flaggedDirectives }
      : null,
  };

  const docHash = createHash('sha256').update(JSON.stringify(schemaSummary)).digest('hex');
  const prev = await db.apiDiscoverySnapshot.findFirst({
    where: { providerKey: provider.key },
    orderBy: { checkedAt: 'desc' },
  });

  const snapshot = await db.apiDiscoverySnapshot.create({
    data: {
      providerKey: provider.key,
      sourceUrl: provider.officialApiDocumentation,
      apiVersion: provider.apiVersion,
      docHash,
      previousHash: prev?.docHash ?? null,
      changed: Boolean(prev?.docHash && prev.docHash !== docHash),
      fetchStatus: 'SNAPSHOT_CATALOG_SYNCED',
      discoveredMeta: JSON.stringify(schemaSummary),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'api.discovery.snapshot',
    target: provider.key,
    providerKey: provider.key,
    metadata: { snapshotId: snapshot.id, docHash, strippedDirectives: docCheck.flaggedDirectives.length },
  });

  return { snapshot, schemaSummary, flaggedDirectives: docCheck.flaggedDirectives };
}

function isSafeHttpsProbeUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export interface LiveVerificationResult {
  providerKey: string;
  tenantId: string;
  executed: boolean;
  verified: boolean;
  status: 'VERIFIED' | 'NOT_VERIFIED' | 'FAILED' | 'OWNER_ACTION_REQUIRED';
  httpStatus: number | null;
  latencyMs: number | null;
  checkedEndpoint: string | null;
  testedAt: string;
  message: string;
}

export async function runLiveReadOnlyVerification(params: {
  tenantId: string;
  providerKey: string;
  actor: string;
}): Promise<LiveVerificationResult> {
  const testedAt = new Date().toISOString();
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error('Unknown provider key.');

  const oauthCred = await resolveVaultSecretForServer({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'oauth_access_token',
    actor: params.actor,
    reason: 'Read-only live provider verification probe',
  });
  const apiKeyCred = oauthCred
    ? null
    : await resolveVaultSecretForServer({
        tenantId: params.tenantId,
        providerKey: params.providerKey,
        credentialType: 'api_key',
        actor: params.actor,
        reason: 'Read-only live provider verification probe',
      });

  const activeSecret = oauthCred ?? apiKeyCred;
  if (!activeSecret) {
    return {
      providerKey: params.providerKey,
      tenantId: params.tenantId,
      executed: false,
      verified: false,
      status: 'OWNER_ACTION_REQUIRED',
      httpStatus: null,
      latencyMs: null,
      checkedEndpoint: null,
      testedAt,
      message: 'No active authorized OAuth token or API key exists in Vault for this tenant/provider. Complete official OAuth or store an API key before running live verification.',
    };
  }

  const baseUrl = provider.apiBaseUrls.find(u => !u.includes('{') && isSafeHttpsProbeUrl(u));
  if (!baseUrl) {
    return {
      providerKey: params.providerKey,
      tenantId: params.tenantId,
      executed: false,
      verified: false,
      status: 'NOT_VERIFIED',
      httpStatus: null,
      latencyMs: null,
      checkedEndpoint: null,
      testedAt,
      message: 'No verified HTTPS API base URL is configured for this provider.',
    };
  }

  let probeUrl: string;
  if (params.providerKey === 'meta_facebook_pages') {
    const probeSpec = provider.apiSpecs.find(spec => spec.method === 'GET' && spec.path === '/me/accounts');
    if (!probeSpec) {
      return {
        providerKey: params.providerKey, tenantId: params.tenantId, executed: false, verified: false,
        status: 'NOT_VERIFIED', httpStatus: null, latencyMs: null, checkedEndpoint: null, testedAt,
        message: 'Meta Pages verification requires the documented GET /me/accounts read-only endpoint.',
      };
    }
    probeUrl = `${baseUrl.replace(/\/$/, '')}/me/accounts?fields=id,name`;
  } else if (params.providerKey === 'whatsapp_cloud_api') {
    const wabaCredential = await resolveVaultSecretForServer({
      tenantId: params.tenantId,
      providerKey: params.providerKey,
      credentialType: 'business_identifier',
      actor: params.actor,
      reason: 'Resolve WhatsApp Business Account ID for read-only verification',
    }) ?? await resolveVaultSecretForServer({
      tenantId: params.tenantId,
      providerKey: params.providerKey,
      credentialType: 'account_identifier',
      actor: params.actor,
      reason: 'Resolve WhatsApp Business Account ID for read-only verification',
    });
    if (!wabaCredential?.plaintext) {
      return {
        providerKey: params.providerKey, tenantId: params.tenantId, executed: false, verified: false,
        status: 'OWNER_ACTION_REQUIRED', httpStatus: null, latencyMs: null, checkedEndpoint: null, testedAt,
        message: 'Store the provider-issued WhatsApp Business Account ID (WABA ID) in the tenant Vault before verifying phone-number access.',
      };
    }
    probeUrl = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(wabaCredential.plaintext)}/phone_numbers?fields=id,display_phone_number,verified_name`;
  } else {
    return {
      providerKey: params.providerKey, tenantId: params.tenantId, executed: false, verified: false,
      status: 'NOT_VERIFIED', httpStatus: null, latencyMs: null, checkedEndpoint: null, testedAt,
      message: 'A provider-specific response validator is not implemented yet. A generic HTTP 200 is not accepted as proof of integration.',
    };
  }
  if (!isSafeHttpsProbeUrl(probeUrl)) throw new Error('Blocked unsafe probe URL.');

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(probeUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${activeSecret.plaintext}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const rawBody = await res.text();
    let payload: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
      payload = null;
    }
    const data = payload && Array.isArray(payload.data) ? payload.data : [];
    const hasAccountRecords = data.some(item => item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string');
    const hasProviderError = Boolean(payload && payload.error);
    const verified = res.ok && !hasProviderError && hasAccountRecords;

    if (verified) {
      await db.vaultCredential.update({
        where: { id: activeSecret.id },
        data: { lastVerifiedAt: new Date(testedAt) },
      });
      const workflow = await db.onboardingWorkflow.findUnique({
        where: { clientId_providerKey: { clientId: params.tenantId, providerKey: params.providerKey } },
      });
      if (workflow?.state === 'AUTHORIZED') {
        const configured = await transitionWorkflowState({
          workflowId: workflow.id,
          nextState: 'CONFIGURED',
          actor: params.actor,
          reason: 'Provider-specific read-only account probe succeeded.',
        });
        await transitionWorkflowState({
          workflowId: configured.id,
          nextState: 'VERIFIED',
          actor: params.actor,
          reason: 'Provider-specific API response contained accessible account identity records.',
        });
      } else if (workflow?.state === 'CONFIGURED') {
        await transitionWorkflowState({
          workflowId: workflow.id,
          nextState: 'VERIFIED',
          actor: params.actor,
          reason: 'Provider-specific API response contained accessible account identity records.',
        });
      }
    }

    await auditEvent({
      actor: params.actor,
      action: 'provider.live_probe',
      target: `${params.tenantId}:${params.providerKey}`,
      providerKey: params.providerKey,
      metadata: { verified, httpStatus: res.status, latencyMs, endpoint: probeUrl, responseHasAccountRecords: hasAccountRecords },
    });

    return {
      providerKey: params.providerKey,
      tenantId: params.tenantId,
      executed: true,
      verified,
      status: verified ? 'VERIFIED' : res.ok ? 'NOT_VERIFIED' : 'FAILED',
      httpStatus: res.status,
      latencyMs,
      checkedEndpoint: probeUrl,
      testedAt,
      message: verified
        ? `Provider-specific read-only account verification succeeded (HTTP ${res.status} in ${latencyMs}ms).`
        : res.ok
          ? 'Provider returned HTTP success but no valid account identity records; integration remains NOT_VERIFIED.'
          : `Live read-only API call returned HTTP ${res.status}. Re-check token scopes or account status.`,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    return {
      providerKey: params.providerKey,
      tenantId: params.tenantId,
      executed: true,
      verified: false,
      status: 'FAILED',
      httpStatus: null,
      latencyMs,
      checkedEndpoint: probeUrl,
      testedAt,
      message: redactSecretText(err instanceof Error ? err.message : 'Network probe failed'),
    };
  } finally {
    clearTimeout(timer);
  }
}
