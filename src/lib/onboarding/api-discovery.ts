import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { resolveVaultSecretForServer, redactSecretText, storeVaultCredential } from './vault-service';
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

export interface DiscoveredProviderAccount {
  id: string;
  name: string;
  phoneNumber?: string;
  verifiedName?: string;
  tokenStored?: boolean;
}

async function fetchMetaGraphJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  if (!isSafeHttpsProbeUrl(url)) throw new Error('Blocked unsafe Meta Graph API URL.');
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { /* handled below */ }
  if (!response.ok || payload.error) {
    throw new Error(redactSecretText(`Meta Graph API HTTP ${response.status}: ${String((payload.error as Record<string, unknown> | undefined)?.message || raw.slice(0, 240))}`));
  }
  return payload;
}

export async function discoverProviderAccounts(params: {
  tenantId: string;
  providerKey: string;
  actor: string;
  ip?: string;
  identityValue?: string;
}): Promise<{ providerKey: string; discovered: DiscoveredProviderAccount[]; storedCredentialCount: number; status: 'DISCOVERED' | 'NO_ACCOUNTS' }> {
  if (!['meta_facebook_pages', 'whatsapp_cloud_api'].includes(params.providerKey)) {
    throw new Error('Account discovery is currently implemented only for Meta Facebook Pages and WhatsApp Cloud API.');
  }
  const token = await resolveVaultSecretForServer({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'oauth_access_token',
    actor: params.actor,
    reason: 'Discover provider-owned Meta assets using official Graph API',
  }) ?? await resolveVaultSecretForServer({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'access_token',
    actor: params.actor,
    reason: 'Discover provider-owned Meta assets using official Graph API',
  });
  if (!token) throw new Error('No active provider-issued OAuth access token exists in the tenant Vault. Complete official OAuth first.');

  const provider = getProviderByKey(params.providerKey)!;
  const baseUrl = provider.apiBaseUrls.find(u => isSafeHttpsProbeUrl(u));
  if (!baseUrl) throw new Error('Meta Graph API HTTPS base URL is not configured.');
  const base = baseUrl.replace(/\/$/, '');
  const tokenScopes = (() => {
    try { return JSON.parse(token.scopes) as string[]; } catch { return []; }
  })();
  const discovered: DiscoveredProviderAccount[] = [];
  let storedCredentialCount = 0;

  if (params.providerKey === 'meta_facebook_pages') {
    const payload = await fetchMetaGraphJson(`${base}/me/accounts?fields=id,name,access_token`, token.plaintext);
    const pages = Array.isArray(payload.data) ? payload.data as Record<string, unknown>[] : [];
    for (const page of pages) {
      if (typeof page.id !== 'string' || typeof page.name !== 'string') continue;
      const id = page.id;
      const hasPageToken = typeof page.access_token === 'string' && page.access_token.length > 0;
      await storeVaultCredential({
        tenantId: params.tenantId,
        providerKey: params.providerKey,
        credentialType: 'account_identifier',
        label: `page_${id}`,
        plaintextValue: id,
        scopes: tokenScopes,
        actor: params.actor,
        ip: params.ip,
      });
      storedCredentialCount += 1;
      if (hasPageToken) {
        await storeVaultCredential({
          tenantId: params.tenantId,
          providerKey: params.providerKey,
          credentialType: 'page_access_token',
          label: id,
          plaintextValue: String(page.access_token),
          scopes: token.scopes ? String(token.scopes).split(',').filter(Boolean) : [],
          actor: params.actor,
          ip: params.ip,
        });
        storedCredentialCount += 1;
      }
      discovered.push({ id, name: page.name, tokenStored: hasPageToken });
    }
  } else {
    const businessesPayload = await fetchMetaGraphJson(`${base}/me/businesses?fields=id,name`, token.plaintext);
    const businesses = Array.isArray(businessesPayload.data) ? businessesPayload.data as Record<string, unknown>[] : [];
    const wabaMap = new Map<string, { id: string; name: string }>();
    for (const business of businesses) {
      if (typeof business.id !== 'string') continue;
      for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
        try {
          const wabasPayload = await fetchMetaGraphJson(`${base}/${encodeURIComponent(business.id)}/${edge}?fields=id,name`, token.plaintext);
          const wabas = Array.isArray(wabasPayload.data) ? wabasPayload.data as Record<string, unknown>[] : [];
          for (const waba of wabas) {
            if (typeof waba.id === 'string') wabaMap.set(waba.id, { id: waba.id, name: typeof waba.name === 'string' ? waba.name : business.id });
          }
        } catch {
          // One unavailable business edge must not discard other accessible assets.
        }
      }
    }

    const targetPhone = (params.identityValue || '').replace(/\D/g, '');
    let selected: { wabaId: string; phoneId: string } | null = null;
    for (const waba of wabaMap.values()) {
      const phonePayload = await fetchMetaGraphJson(`${base}/${encodeURIComponent(waba.id)}/phone_numbers?fields=id,display_phone_number,verified_name`, token.plaintext);
      const phoneNumbers = Array.isArray(phonePayload.data) ? phonePayload.data as Record<string, unknown>[] : [];
      for (const phone of phoneNumbers) {
        if (typeof phone.id !== 'string') continue;
        const displayPhone = typeof phone.display_phone_number === 'string' ? phone.display_phone_number : '';
        const record = {
          id: phone.id,
          name: waba.name,
          phoneNumber: displayPhone,
          verifiedName: typeof phone.verified_name === 'string' ? phone.verified_name : undefined,
        };
        discovered.push(record);
        await storeVaultCredential({
          tenantId: params.tenantId,
          providerKey: params.providerKey,
          credentialType: 'business_identifier',
          label: `waba_${waba.id}`,
          plaintextValue: waba.id,
          scopes: token.scopes ? String(token.scopes).split(',').filter(Boolean) : [],
          actor: params.actor,
          ip: params.ip,
        });
        await storeVaultCredential({
          tenantId: params.tenantId,
          providerKey: params.providerKey,
          credentialType: 'account_identifier',
          label: `phone_${phone.id}`,
          plaintextValue: phone.id,
          scopes: token.scopes ? String(token.scopes).split(',').filter(Boolean) : [],
          actor: params.actor,
          ip: params.ip,
        });
        storedCredentialCount += 2;
        if (targetPhone && displayPhone.replace(/\D/g, '') === targetPhone) selected = { wabaId: waba.id, phoneId: phone.id };
      }
    }
    if (selected) {
      await storeVaultCredential({
        tenantId: params.tenantId, providerKey: params.providerKey, credentialType: 'business_identifier',
        label: 'primary', plaintextValue: selected.wabaId, actor: params.actor, ip: params.ip,
      });
      await storeVaultCredential({
        tenantId: params.tenantId, providerKey: params.providerKey, credentialType: 'account_identifier',
        label: 'primary', plaintextValue: selected.phoneId, actor: params.actor, ip: params.ip,
      });
      storedCredentialCount += 2;
    }
  }

  await auditEvent({
    actor: params.actor,
    action: 'provider.account_discovery',
    target: `${params.tenantId}:${params.providerKey}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { discoveredCount: discovered.length, storedCredentialCount },
  });
  return {
    providerKey: params.providerKey,
    discovered,
    storedCredentialCount,
    status: discovered.length ? 'DISCOVERED' : 'NO_ACCOUNTS',
  };
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
