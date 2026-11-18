import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { decryptVaultValue, encryptVaultValue, vaultConfigured } from '@/lib/security/vault-crypto';
import {
  listVaultCredentialsMetadata,
  resolveVaultSecretForServer,
  revokeVaultCredential,
  storeVaultCredential,
  redactSecretText,
} from './vault-service';
import { auditEvent } from '@/lib/security/audit';

function base64UrlSha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('base64url');
}

export function validateOAuthRedirectUri(rawUri: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUri);
  } catch {
    return { ok: false, reason: 'Invalid OAuth redirectUri.' };
  }
  if (parsed.hash) {
    return { ok: false, reason: 'OAuth redirectUri must not contain a URL fragment.' };
  }
  if (parsed.protocol === 'https:') {
    return { ok: true };
  }
  if (parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')) {
    return { ok: true };
  }
  return { ok: false, reason: 'OAuth redirectUri must use HTTPS (or loopback localhost/127.0.0.1 for local desktop CLI).' };
}

function validateOAuthEndpointUrl(rawUrl: string, providerKey: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid OAuth endpoint URL for ${providerKey}.`);
  }
  const allowLocalTest = process.env.ALOAPI_ALLOW_TEST_OAUTH_LOCALHOST === 'true';
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (isLoopback && allowLocalTest && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    return parsed.toString();
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`OAuth token/revocation endpoint for ${providerKey} must enforce HTTPS.`);
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error(`OAuth endpoint host ${host} is blocked by SSRF policy.`);
  }
  return parsed.toString();
}

export async function createOAuthAuthorizationFlow(params: {
  tenantId: string;
  providerKey: string;
  redirectUri: string;
  requestedScopes?: string[];
  dynamicParams?: Record<string, string>;
  actor: string;
  ip?: string;
}) {
  if (!vaultConfigured()) {
    throw new Error('ALOAPI_VAULT_KEY must be configured to protect OAuth PKCE state.');
  }
  const uriCheck = validateOAuthRedirectUri(params.redirectUri);
  if (!uriCheck.ok) {
    throw new Error(uriCheck.reason);
  }
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error('Unknown provider key.');
  if (!provider.oauthSupport || !provider.oauthConfig) {
    throw new Error(`${provider.displayName} does not support browser OAuth 2.0 flow; use scoped API key setup instead.`);
  }

  let authUrlRaw = provider.oauthConfig.authUrl;
  for (const [key, value] of Object.entries(params.dynamicParams ?? {})) {
    const clean = value.trim();
    if (!/^[a-z0-9.-]+$/i.test(clean)) {
      throw new Error(`Invalid host/domain parameter for ${key}.`);
    }
    authUrlRaw = authUrlRaw.replace(`{${key}}`, clean);
  }
  if (/\{[^}]+\}/.test(authUrlRaw)) {
    throw new Error(`Missing required template variable in official auth URL: ${authUrlRaw}`);
  }

  let clientId = '';
  const storedClientId = await resolveVaultSecretForServer({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'oauth_client_id',
    actor: params.actor,
    reason: 'Construct official OAuth authorization URL',
  });
  if (storedClientId) {
    clientId = storedClientId.plaintext;
  } else {
    const clientEnv = provider.environmentVariables.find(v => /CLIENT_ID|APP_ID|CLIENT_KEY|APPLICATION_ID/i.test(v.name));
    if (clientEnv && process.env[clientEnv.name]) {
      clientId = process.env[clientEnv.name]!;
    }
  }

  const savedCredentialMetadata = await listVaultCredentialsMetadata(params.tenantId, params.providerKey);
  const clientSecretConfigured = savedCredentialMetadata.some(
    credential => credential.credentialType === 'oauth_client_secret' && credential.effectiveStatus === 'ACTIVE',
  );

  const stateToken = randomBytes(24).toString('base64url');
  const pkceVerifier = provider.oauthConfig.pkceSupported ? randomBytes(48).toString('base64url') : null;
  const codeChallenge = pkceVerifier ? base64UrlSha256(pkceVerifier) : null;
  const scopes = (params.requestedScopes?.length ? params.requestedScopes : provider.requiredScopes).slice();

  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await db.oAuthAuthorizationState.create({
    data: {
      clientId: params.tenantId,
      providerKey: params.providerKey,
      state: stateToken,
      codeVerifierCiphertext: pkceVerifier ? encryptVaultValue(pkceVerifier) : null,
      redirectUri: params.redirectUri,
      scopes: JSON.stringify(scopes),
      status: 'pending',
      expiresAt,
    },
  });

  const authUrl = new URL(authUrlRaw);
  const clientIdParam = provider.oauthConfig.clientIdParam || 'client_id';
  authUrl.searchParams.set(clientIdParam, clientId || 'CONFIGURE_OFFICIAL_CLIENT_ID_IN_VAULT');
  authUrl.searchParams.set('redirect_uri', params.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', stateToken);
  if (scopes.length) {
    authUrl.searchParams.set('scope', scopes.join(provider.oauthConfig.scopeSeparator));
  }
  if (codeChallenge) {
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(provider.oauthConfig.extraAuthParams ?? {})) {
    authUrl.searchParams.set(k, v);
  }

  await auditEvent({
    actor: params.actor,
    action: 'oauth.state.create',
    target: `${params.tenantId}:${params.providerKey}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { pkceEnabled: Boolean(codeChallenge), clientIdConfigured: Boolean(clientId), scopeCount: scopes.length },
  });

  return {
    stateToken,
    expiresAt: expiresAt.toISOString(),
    pkceEnabled: Boolean(codeChallenge),
    clientIdConfigured: Boolean(clientId),
    clientSecretConfigured,
    authorizationUrl: authUrl.toString(),
    scopes,
    warning: !clientId
      ? 'Save the official OAuth Client ID / App ID in the provider Vault before continuing.'
      : !clientSecretConfigured
        ? 'Save the official OAuth Client Secret / App Secret in the provider Vault before continuing.'
        : null,
  };
}

const PROCESSING_LEASE_MS = 60_000;

export async function handleOAuthCallback(params: {
  stateToken: string;
  code?: string;
  error?: string;
  errorDescription?: string;
  dynamicParams?: Record<string, string>;
  actor: string;
  ip?: string;
}) {
  const now = new Date();
  const leaseTag = `lease_until:${now.getTime() + PROCESSING_LEASE_MS}`;

  // Atomic conditional state claim: PENDING -> PROCESSING (zero external I/O inside transaction)
  let claimed = await db.oAuthAuthorizationState.updateMany({
    where: {
      state: params.stateToken,
      consumedAt: null,
      expiresAt: { gt: now },
      status: 'pending',
    },
    data: {
      status: 'processing',
      errorDetail: leaseTag,
    },
  });

  if (claimed.count !== 1) {
    const existing = await db.oAuthAuthorizationState.findUnique({ where: { state: params.stateToken } });
    if (!existing) {
      throw new Error('Unknown OAuth state token.');
    }
    if (existing.consumedAt) {
      throw new Error('OAuth state token has already been consumed (replay rejected).');
    }
    if (existing.expiresAt.getTime() <= now.getTime()) {
      await db.oAuthAuthorizationState.updateMany({
        where: { id: existing.id, status: 'pending' },
        data: { status: 'expired' },
      });
      throw new Error('OAuth authorization state expired.');
    }
    // Check safe lease expiry recovery if a prior worker crashed during 'processing'
    const leaseMatch = /^lease_until:(\d+)$/.exec(existing.errorDetail || '');
    if (existing.status === 'processing' && leaseMatch && Number(leaseMatch[1]) < now.getTime()) {
      claimed = await db.oAuthAuthorizationState.updateMany({
        where: {
          id: existing.id,
          consumedAt: null,
          status: 'processing',
          errorDetail: existing.errorDetail,
        },
        data: {
          status: 'processing',
          errorDetail: leaseTag,
        },
      });
    }
    if (claimed.count !== 1) {
      if (existing.status === 'processing') {
        throw new Error('OAuth state token is currently being processed by another callback request (concurrent replay rejected).');
      }
      throw new Error(`OAuth state token is invalid for callback (status: ${existing.status}).`);
    }
  }

  const row = await db.oAuthAuthorizationState.findUnique({
    where: { state: params.stateToken },
  });
  if (!row) {
    throw new Error('Unknown OAuth state token.');
  }

  if (params.error) {
    await db.oAuthAuthorizationState.update({
      where: { id: row.id },
      data: {
        status: 'denied',
        consumedAt: new Date(),
        errorDetail: redactSecretText(`${params.error}: ${params.errorDescription || ''}`),
      },
    });
    return { ok: false, providerKey: row.providerKey, tenantId: row.clientId, status: 'DENIED', error: params.error };
  }

  if (!params.code) {
    await db.oAuthAuthorizationState.update({
      where: { id: row.id },
      data: { status: 'failed', consumedAt: new Date(), errorDetail: 'Missing authorization code on OAuth callback.' },
    });
    throw new Error('Missing authorization code on OAuth callback.');
  }

  const provider = getProviderByKey(row.providerKey);
  if (!provider || !provider.oauthConfig) {
    await db.oAuthAuthorizationState.update({
      where: { id: row.id },
      data: { status: 'failed', consumedAt: new Date(), errorDetail: 'Provider OAuth metadata missing.' },
    });
    throw new Error('Provider OAuth metadata missing.');
  }

  const storedId = await resolveVaultSecretForServer({
    tenantId: row.clientId,
    providerKey: row.providerKey,
    credentialType: 'oauth_client_id',
    actor: params.actor,
    reason: 'OAuth authorization code exchange',
  });
  const storedSecret = await resolveVaultSecretForServer({
    tenantId: row.clientId,
    providerKey: row.providerKey,
    credentialType: 'oauth_client_secret',
    actor: params.actor,
    reason: 'OAuth authorization code exchange',
  });

  const idEnv = provider.environmentVariables.find(v => /CLIENT_ID|APP_ID|CLIENT_KEY|APPLICATION_ID/i.test(v.name));
  const secretEnv = provider.environmentVariables.find(v => /CLIENT_SECRET|APP_SECRET|SECRET/i.test(v.name));
  const clientId = storedId?.plaintext || (idEnv ? process.env[idEnv.name] : '') || '';
  const clientSecret = storedSecret?.plaintext || (secretEnv ? process.env[secretEnv.name] : '') || '';

  if (!clientId || !clientSecret) {
    await db.oAuthAuthorizationState.update({
      where: { id: row.id },
      data: { status: 'requires_client_secret', consumedAt: new Date(), errorDetail: 'Client ID or Secret missing for token exchange.' },
    });
    return {
      ok: false,
      providerKey: row.providerKey,
      tenantId: row.clientId,
      status: 'REQUIRES_CLIENT_SECRET',
      error: 'OAuth callback state verified, but official Client ID / Client Secret are not yet stored in Vault.',
    };
  }

  let tokenUrl = provider.oauthConfig.tokenUrl;
  for (const [k, v] of Object.entries(params.dynamicParams ?? {})) {
    if (!/^[a-z0-9.-]+$/i.test(v)) throw new Error(`Invalid dynamic param ${k}`);
    tokenUrl = tokenUrl.replace(`{${k}}`, v);
  }
  if (/\{[^}]+\}/.test(tokenUrl)) {
    throw new Error('Missing dynamic host parameter for provider token URL.');
  }
  tokenUrl = validateOAuthEndpointUrl(tokenUrl, row.providerKey);

  const form = new URLSearchParams();
  form.set('grant_type', 'authorization_code');
  form.set('code', params.code);
  form.set('redirect_uri', row.redirectUri);
  form.set(provider.oauthConfig.clientIdParam || 'client_id', clientId);
  form.set('client_secret', clientSecret);
  if (row.codeVerifierCiphertext) {
    form.set('code_verifier', decryptVaultValue(row.codeVerifierCiphertext));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(rawText) as Record<string, unknown>; } catch { /* non-json */ }

    if (!res.ok || !payload.access_token) {
      const msg = redactSecretText(`Token exchange HTTP ${res.status}: ${String(payload.error_description || payload.error || rawText.slice(0, 180))}`);
      await db.oAuthAuthorizationState.update({
        where: { id: row.id },
        data: { status: 'failed', consumedAt: new Date(), errorDetail: msg },
      });
      return { ok: false, providerKey: row.providerKey, tenantId: row.clientId, status: 'FAILED', error: msg };
    }

    const expiresInSec = typeof payload.expires_in === 'number' ? payload.expires_in : null;
    const tokenExpiry = expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null;
    const scopes = (() => { try { return JSON.parse(row.scopes) as string[]; } catch { return []; } })();

    await storeVaultCredential({
      tenantId: row.clientId,
      providerKey: row.providerKey,
      credentialType: 'oauth_access_token',
      label: 'primary',
      plaintextValue: String(payload.access_token),
      scopes,
      expiresAt: tokenExpiry,
      refreshable: Boolean(payload.refresh_token),
      actor: params.actor,
      ip: params.ip,
    });

    if (typeof payload.refresh_token === 'string' && payload.refresh_token) {
      await storeVaultCredential({
        tenantId: row.clientId,
        providerKey: row.providerKey,
        credentialType: 'oauth_refresh_token',
        label: 'primary',
        plaintextValue: payload.refresh_token,
        scopes,
        actor: params.actor,
        ip: params.ip,
      });
    }

    await db.oAuthAuthorizationState.update({
      where: { id: row.id },
      data: { status: 'authorized', consumedAt: new Date(), errorDetail: null },
    });

    await auditEvent({
      actor: params.actor,
      action: 'oauth.token.exchanged',
      target: `${row.clientId}:${row.providerKey}`,
      providerKey: row.providerKey,
      ip: params.ip,
      metadata: { hasRefreshToken: Boolean(payload.refresh_token), expiresInSec },
    });

    return {
      ok: true,
      providerKey: row.providerKey,
      tenantId: row.clientId,
      status: 'AUTHORIZED',
      expiresAt: tokenExpiry?.toISOString() ?? null,
    };
  } catch (err) {
    const msg = redactSecretText(err instanceof Error ? err.message : 'OAuth token exchange error');
    await db.oAuthAuthorizationState.update({
      where: { id: row.id },
      data: { status: 'failed', consumedAt: new Date(), errorDetail: msg },
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshOAuthTokens(params: {
  tenantId: string;
  providerKey: string;
  dynamicParams?: Record<string, string>;
  actor: string;
  ip?: string;
}) {
  const provider = getProviderByKey(params.providerKey);
  if (!provider || !provider.oauthConfig) {
    throw new Error('Provider OAuth metadata missing.');
  }

  const refreshCred = await resolveVaultSecretForServer({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'oauth_refresh_token',
    actor: params.actor,
    reason: 'OAuth refresh_token rotation',
  });
  if (!refreshCred) {
    return { ok: false, status: 'REFRESH_TOKEN_MISSING', error: 'No active refresh_token found in Vault.' };
  }

  const storedId = await resolveVaultSecretForServer({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'oauth_client_id',
    actor: params.actor,
    reason: 'OAuth refresh_token exchange',
  });
  const storedSecret = await resolveVaultSecretForServer({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'oauth_client_secret',
    actor: params.actor,
    reason: 'OAuth refresh_token exchange',
  });
  const clientId = storedId?.plaintext || '';
  const clientSecret = storedSecret?.plaintext || '';
  if (!clientId || !clientSecret) {
    return { ok: false, status: 'REQUIRES_CLIENT_SECRET', error: 'Client ID or Client Secret missing in Vault.' };
  }

  let tokenUrl = provider.oauthConfig.tokenUrl;
  for (const [k, v] of Object.entries(params.dynamicParams ?? {})) {
    if (!/^[a-z0-9.-]+$/i.test(v)) throw new Error(`Invalid dynamic param ${k}`);
    tokenUrl = tokenUrl.replace(`{${k}}`, v);
  }
  tokenUrl = validateOAuthEndpointUrl(tokenUrl, params.providerKey);

  const form = new URLSearchParams();
  form.set('grant_type', 'refresh_token');
  form.set('refresh_token', refreshCred.plaintext);
  form.set(provider.oauthConfig.clientIdParam || 'client_id', clientId);
  form.set('client_secret', clientSecret);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const rawText = await res.text();
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(rawText) as Record<string, unknown>; } catch { /* non-json */ }
  if (!res.ok || !payload.access_token) {
    const errText = redactSecretText(`Refresh HTTP ${res.status}: ${String(payload.error_description || payload.error || rawText.slice(0, 160))}`);
    return { ok: false, status: 'REFRESH_FAILED', error: errText };
  }

  const expiresInSec = typeof payload.expires_in === 'number' ? payload.expires_in : null;
  const tokenExpiry = expiresInSec ? new Date(Date.now() + expiresInSec * 1000) : null;
  const scopes = (() => { try { return JSON.parse(refreshCred.scopes) as string[]; } catch { return []; } })();

  await storeVaultCredential({
    tenantId: params.tenantId,
    providerKey: params.providerKey,
    credentialType: 'oauth_access_token',
    label: 'primary',
    plaintextValue: String(payload.access_token),
    scopes,
    expiresAt: tokenExpiry,
    refreshable: true,
    actor: params.actor,
    ip: params.ip,
  });

  if (typeof payload.refresh_token === 'string' && payload.refresh_token) {
    await storeVaultCredential({
      tenantId: params.tenantId,
      providerKey: params.providerKey,
      credentialType: 'oauth_refresh_token',
      label: 'primary',
      plaintextValue: payload.refresh_token,
      scopes,
      actor: params.actor,
      ip: params.ip,
    });
  }

  await auditEvent({
    actor: params.actor,
    action: 'oauth.token.refreshed',
    target: `${params.tenantId}:${params.providerKey}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { rotatedRefreshToken: Boolean(payload.refresh_token), expiresInSec },
  });

  return {
    ok: true,
    status: 'REFRESHED',
    rotatedRefreshToken: Boolean(payload.refresh_token),
    expiresAt: tokenExpiry?.toISOString() ?? null,
  };
}

export async function revokeOAuthTokens(params: {
  tenantId: string;
  providerKey: string;
  reason?: string;
  actor: string;
  ip?: string;
}) {
  const provider = getProviderByKey(params.providerKey);
  let remoteRevokeAttempted = false;
  let remoteRevokeStatus: number | null = null;

  if (provider?.oauthConfig?.revokeUrl && !/\{[^}]+\}/.test(provider.oauthConfig.revokeUrl)) {
    const activeToken = await resolveVaultSecretForServer({
      tenantId: params.tenantId,
      providerKey: params.providerKey,
      credentialType: 'oauth_access_token',
      actor: params.actor,
      reason: 'Remote OAuth revocation request',
    }).catch(() => null);

    if (activeToken) {
      remoteRevokeAttempted = true;
      try {
        const revokeEndpoint = validateOAuthEndpointUrl(provider.oauthConfig.revokeUrl, params.providerKey);
        const res = await fetch(revokeEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: activeToken.plaintext }).toString(),
          signal: AbortSignal.timeout(8_000),
        });
        remoteRevokeStatus = res.status;
      } catch {
        remoteRevokeStatus = null;
      }
    }
  }

  const creds = await listVaultCredentialsMetadata(params.tenantId, params.providerKey);
  const oauthCreds = creds.filter(c => !c.revokedAt && (c.credentialType === 'oauth_access_token' || c.credentialType === 'oauth_refresh_token'));
  for (const cred of oauthCreds) {
    await revokeVaultCredential({
      credentialId: cred.id,
      tenantId: params.tenantId,
      reason: params.reason || 'OAuth authorization revoked by administrator',
      actor: params.actor,
      ip: params.ip,
    });
  }
  const states = await db.oAuthAuthorizationState.updateMany({
    where: { clientId: params.tenantId, providerKey: params.providerKey, status: { in: ['pending', 'processing', 'authorized'] } },
    data: { status: 'revoked', errorDetail: params.reason || 'Revoked by administrator' },
  });
  await auditEvent({
    actor: params.actor,
    action: 'oauth.connection.revoked',
    target: `${params.tenantId}:${params.providerKey}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { revokedCredentials: oauthCreds.length, updatedStates: states.count, remoteRevokeAttempted, remoteRevokeStatus },
  });
  return { revokedCredentials: oauthCreds.length, updatedStates: states.count, remoteRevokeAttempted, remoteRevokeStatus };
}
