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
    authorizationUrl: authUrl.toString(),
    scopes,
    warning: clientId
      ? null
      : 'Client ID is not yet stored in Vault or env; replace CONFIGURE_OFFICIAL_CLIENT_ID_IN_VAULT after registering your official app.',
  };
}

export async function handleOAuthCallback(params: {
  stateToken: string;
  code?: string;
  error?: string;
  errorDescription?: string;
  dynamicParams?: Record<string, string>;
  actor: string;
  ip?: string;
}) {
  const row = await db.oAuthAuthorizationState.findUnique({
    where: { state: params.stateToken },
  });
  if (!row) {
    throw new Error('Unknown OAuth state token.');
  }
  if (row.consumedAt) {
    throw new Error('OAuth state token has already been consumed (replay rejected).');
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.oAuthAuthorizationState.update({ where: { id: row.id }, data: { status: 'expired' } });
    throw new Error('OAuth authorization state expired.');
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
    throw new Error('Missing authorization code on OAuth callback.');
  }

  const provider = getProviderByKey(row.providerKey);
  if (!provider || !provider.oauthConfig) {
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
      data: { status: 'requires_client_secret', errorDetail: 'Client ID or Secret missing for token exchange.' },
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
      data: { status: 'authorized', consumedAt: new Date() },
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
  } finally {
    clearTimeout(timer);
  }
}

export async function revokeOAuthTokens(params: {
  tenantId: string;
  providerKey: string;
  reason?: string;
  actor: string;
  ip?: string;
}) {
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
    where: { clientId: params.tenantId, providerKey: params.providerKey, status: { in: ['pending', 'authorized'] } },
    data: { status: 'revoked', errorDetail: params.reason || 'Revoked by administrator' },
  });
  await auditEvent({
    actor: params.actor,
    action: 'oauth.connection.revoked',
    target: `${params.tenantId}:${params.providerKey}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { revokedCredentials: oauthCreds.length, updatedStates: states.count },
  });
  return { revokedCredentials: oauthCreds.length, updatedStates: states.count };
}
