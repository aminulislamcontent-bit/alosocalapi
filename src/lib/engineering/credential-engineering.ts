import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { storeVaultCredential } from '@/lib/onboarding/vault-service';
import { vaultConfigured } from '@/lib/security/vault-crypto';
import { auditEvent } from '@/lib/security/audit';
import { buildProviderAdapterProfile, type HandoverMode } from './provider-adapters';

export type CredentialOrigin =
  | 'ALOAPI-GENERATED'
  | 'PROVIDER-ISSUED'
  | 'CLIENT-OWNED'
  | 'PREPARED-CONFIGURATION';

export type CredentialActivationStatus =
  | 'READY'
  | 'CONFIGURED'
  | 'TESTED'
  | 'VERIFIED'
  | 'CLIENT_ACTIVATION_REQUIRED'
  | 'PROVIDER_APPROVAL_REQUIRED'
  | 'NOT_SUPPORTED';

export function generateAloapiCryptoMaterial(kind: 'webhook_signing_secret' | 'jwt_signing_key' | 'key_pair' | 'api_key') {
  if (kind === 'webhook_signing_secret') {
    const secret = `whsec_aloapi_${randomBytes(32).toString('base64url')}`;
    return {
      secretValue: secret,
      publicMetadata: { algorithm: 'HMAC-SHA256', prefix: 'whsec_aloapi_', byteLength: 32 },
    };
  }
  if (kind === 'jwt_signing_key') {
    const secret = `jwt_aloapi_${randomBytes(32).toString('base64url')}`;
    return {
      secretValue: secret,
      publicMetadata: { algorithm: 'HS256', keyBits: 256 },
    };
  }
  if (kind === 'key_pair') {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
      secretValue: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicMetadata: {
        algorithm: 'Ed25519',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    };
  }
  const token = `aloapi_int_${randomBytes(24).toString('base64url')}`;
  return {
    secretValue: token,
    publicMetadata: { format: 'opaque_bearer', entropyBits: 192 },
  };
}

export async function prepareProviderEngineeringSetup(params: {
  projectId: string;
  providerKey: string;
  publicBaseUrl?: string;
  actor: string;
  ip?: string;
}) {
  const project = await db.integrationProject.findUnique({ where: { id: params.projectId } });
  if (!project) throw new Error('IntegrationProject not found.');

  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error(`Unknown provider key: ${params.providerKey}`);

  const profile = buildProviderAdapterProfile(provider.key, {
    publicBaseUrl: params.publicBaseUrl,
    domain: project.domain,
  });

  // Generate ALOAPI-owned signing/encryption material immediately into encrypted Vault
  let webhookVaultId: string | null = null;
  let jwtVaultId: string | null = null;
  let ed25519PublicMeta: Record<string, unknown> = {};
  let keyPairVaultId: string | null = null;

  if (vaultConfigured()) {
    const wh = generateAloapiCryptoMaterial('webhook_signing_secret');
    const storedWh = await storeVaultCredential({
      tenantId: project.clientId,
      providerKey: provider.key,
      credentialType: 'webhook_signing_secret',
      label: `project_${project.id}`,
      plaintextValue: wh.secretValue,
      scopes: ['webhook.verify'],
      actor: params.actor,
      ip: params.ip,
    });
    webhookVaultId = storedWh.id;

    const jwt = generateAloapiCryptoMaterial('jwt_signing_key');
    const storedJwt = await storeVaultCredential({
      tenantId: project.clientId,
      providerKey: provider.key,
      credentialType: 'jwt_signing_key',
      label: `project_${project.id}`,
      plaintextValue: jwt.secretValue,
      scopes: ['internal.assertion'],
      actor: params.actor,
      ip: params.ip,
    });
    jwtVaultId = storedJwt.id;

    const kp = generateAloapiCryptoMaterial('key_pair');
    const storedKp = await storeVaultCredential({
      tenantId: project.clientId,
      providerKey: provider.key,
      credentialType: 'key_pair',
      label: `project_${project.id}`,
      plaintextValue: kp.secretValue,
      scopes: ['request.sign'],
      actor: params.actor,
      ip: params.ip,
    });
    keyPairVaultId = storedKp.id;
    ed25519PublicMeta = kp.publicMetadata;
  }

  // Upsert OAuth Application & Webhook Registry Entry
  const verificationStatus: CredentialActivationStatus =
    profile.executionMode === 'UNSUPPORTED'
      ? 'NOT_SUPPORTED'
      : provider.businessVerificationRequirements && !/none/i.test(provider.businessVerificationRequirements)
        ? 'PROVIDER_APPROVAL_REQUIRED'
        : 'CONFIGURED';

  const oauthApp = await db.oAuthAppRegistryEntry.upsert({
    where: { projectId_providerKey: { projectId: project.id, providerKey: provider.key } },
    update: {
      appName: `${project.name} — ${provider.displayName}`,
      developerPortalUrl: provider.officialDeveloperPortal || provider.officialWebsite,
      executionMode: profile.executionMode,
      redirectUrisJson: JSON.stringify(profile.oauthRedirectUrisTemplate),
      callbackUrlsJson: JSON.stringify([profile.webhookUrlTemplate]),
      webhookUrl: profile.webhookUrlTemplate,
      webhookEventsJson: JSON.stringify(provider.webhookSupport.events),
      webhookSignatureAlgorithm: profile.webhookSignatureAlgorithm,
      apiVersion: provider.apiVersion,
      scopesJson: JSON.stringify(provider.requiredScopes),
      dnsRecordsJson: JSON.stringify(profile.dnsVerificationRecords),
      verificationStatus,
      approvalChecklistJson: JSON.stringify(profile.verificationAndApprovalSteps),
      configProfileJson: JSON.stringify({
        baseUrls: provider.apiBaseUrls,
        endpoints: provider.apiSpecs,
        rateLimitsAndPricing: provider.rateLimitsAndPricing,
        handoverMode: profile.handoverMode,
        handoverRationale: profile.handoverRationale,
        ed25519PublicKeyPem: ed25519PublicMeta.publicKeyPem ?? null,
      }),
    },
    create: {
      projectId: project.id,
      providerKey: provider.key,
      appName: `${project.name} — ${provider.displayName}`,
      developerPortalUrl: provider.officialDeveloperPortal || provider.officialWebsite,
      executionMode: profile.executionMode,
      redirectUrisJson: JSON.stringify(profile.oauthRedirectUrisTemplate),
      callbackUrlsJson: JSON.stringify([profile.webhookUrlTemplate]),
      webhookUrl: profile.webhookUrlTemplate,
      webhookEventsJson: JSON.stringify(provider.webhookSupport.events),
      webhookSignatureAlgorithm: profile.webhookSignatureAlgorithm,
      apiVersion: provider.apiVersion,
      scopesJson: JSON.stringify(provider.requiredScopes),
      dnsRecordsJson: JSON.stringify(profile.dnsVerificationRecords),
      verificationStatus,
      approvalChecklistJson: JSON.stringify(profile.verificationAndApprovalSteps),
      configProfileJson: JSON.stringify({
        baseUrls: provider.apiBaseUrls,
        endpoints: provider.apiSpecs,
        rateLimitsAndPricing: provider.rateLimitsAndPricing,
        handoverMode: profile.handoverMode,
        handoverRationale: profile.handoverRationale,
        ed25519PublicKeyPem: ed25519PublicMeta.publicKeyPem ?? null,
      }),
    },
  });

  // Prepare explicit Credential Ledger Entries across all 4 Classification Origins
  const credentialSpecs: {
    credentialType: string;
    origin: CredentialOrigin;
    owner: 'aloapi_platform' | 'client_owner' | 'shared_delegated';
    envVarName: string;
    vaultCredentialId: string | null;
    transferable: boolean;
    handoverMode: HandoverMode;
    activationStatus: CredentialActivationStatus;
    handoverRequirements: string;
    preparedMetadata: Record<string, unknown>;
  }[] = [
    {
      credentialType: 'webhook_signing_secret',
      origin: 'ALOAPI-GENERATED',
      owner: 'aloapi_platform',
      envVarName: `ALOAPI_${provider.key.toUpperCase()}_WEBHOOK_SECRET`,
      vaultCredentialId: webhookVaultId,
      transferable: true,
      handoverMode: 'DIRECT_TRANSFER',
      activationStatus: webhookVaultId ? 'READY' : 'CLIENT_ACTIVATION_REQUIRED',
      handoverRequirements: 'Rotate or export encrypted envelope via owner-authorized handover if endpoint moves to client infra.',
      preparedMetadata: { algorithm: profile.webhookSignatureAlgorithm, webhookUrl: profile.webhookUrlTemplate },
    },
    {
      credentialType: 'jwt_signing_key',
      origin: 'ALOAPI-GENERATED',
      owner: 'aloapi_platform',
      envVarName: `ALOAPI_${provider.key.toUpperCase()}_JWT_KEY`,
      vaultCredentialId: jwtVaultId,
      transferable: true,
      handoverMode: 'DIRECT_TRANSFER',
      activationStatus: jwtVaultId ? 'READY' : 'CLIENT_ACTIVATION_REQUIRED',
      handoverRequirements: 'Client project generates replacement JWT key at deployment or authorizes encrypted transfer.',
      preparedMetadata: { algorithm: 'HS256' },
    },
    {
      credentialType: 'key_pair',
      origin: 'ALOAPI-GENERATED',
      owner: 'aloapi_platform',
      envVarName: `ALOAPI_${provider.key.toUpperCase()}_ED25519_PRIVATE_KEY`,
      vaultCredentialId: keyPairVaultId,
      transferable: true,
      handoverMode: 'DIRECT_TRANSFER',
      activationStatus: keyPairVaultId ? 'READY' : 'CLIENT_ACTIVATION_REQUIRED',
      handoverRequirements: 'Public key included in non-secret handover manifest; private key stays encrypted in Vault.',
      preparedMetadata: ed25519PublicMeta,
    },
    {
      credentialType: 'config_value',
      origin: 'PREPARED-CONFIGURATION',
      owner: 'client_owner',
      envVarName: `ALOAPI_${provider.key.toUpperCase()}_REDIRECT_URI`,
      vaultCredentialId: null,
      transferable: true,
      handoverMode: 'CONFIGURATION_ONLY',
      activationStatus: 'CONFIGURED',
      handoverRequirements: 'Register prepared redirect URI / callback URL inside official developer portal.',
      preparedMetadata: {
        redirectUris: profile.oauthRedirectUrisTemplate,
        webhookUrl: profile.webhookUrlTemplate,
        apiVersion: provider.apiVersion,
        dnsRecords: profile.dnsVerificationRecords,
      },
    },
  ];

  // Add PROVIDER-ISSUED / CLIENT-OWNED slots from catalog env vars without inventing values
  for (const envVar of provider.environmentVariables) {
    const credType = /CLIENT_ID|APP_ID|APPLICATION_ID/i.test(envVar.name)
      ? 'oauth_client_id'
      : /CLIENT_SECRET|APP_SECRET/i.test(envVar.name)
        ? 'oauth_client_secret'
        : /REFRESH_TOKEN/i.test(envVar.name)
          ? 'refresh_token'
          : /ACCESS_TOKEN|TOKEN/i.test(envVar.name)
            ? 'access_token'
            : /SERVICE_ACCOUNT/i.test(envVar.name)
              ? 'service_account'
              : envVar.secret
                ? 'api_key'
                : 'config_value';

    const origin: CredentialOrigin = !envVar.secret
      ? 'PREPARED-CONFIGURATION'
      : /CLIENT_ID|CLIENT_SECRET|APP_ID|APP_SECRET|SERVICE_ACCOUNT/i.test(envVar.name)
        ? 'CLIENT-OWNED'
        : 'PROVIDER-ISSUED';

    const existingVault = envVar.secret
      ? await db.vaultCredential.findFirst({
          where: {
            clientId: project.clientId,
            providerKey: provider.key,
            credentialType: credType,
            status: 'active',
            revokedAt: null,
          },
          select: { id: true, expiresAt: true },
        })
      : null;

    credentialSpecs.push({
      credentialType: credType,
      origin,
      owner: origin === 'CLIENT-OWNED' ? 'client_owner' : 'shared_delegated',
      envVarName: envVar.name,
      vaultCredentialId: envVar.secret ? (existingVault?.id ?? null) : null,
      transferable: profile.credentialsTransferable,
      handoverMode: profile.handoverMode,
      activationStatus: existingVault
        ? 'CONFIGURED'
        : verificationStatus === 'PROVIDER_APPROVAL_REQUIRED'
          ? 'PROVIDER_APPROVAL_REQUIRED'
          : 'CLIENT_ACTIVATION_REQUIRED',
      handoverRequirements: profile.handoverRationale,
      preparedMetadata: {
        purpose: envVar.purpose,
        required: envVar.required,
        secret: envVar.secret,
      },
    });
  }

  const savedCreds: Awaited<ReturnType<typeof db.credentialPreparationRecord.upsert>>[] = [];
  for (const spec of credentialSpecs) {
    const rec = await db.credentialPreparationRecord.upsert({
      where: {
        projectId_providerKey_credentialType_envVarName: {
          projectId: project.id,
          providerKey: provider.key,
          credentialType: spec.credentialType,
          envVarName: spec.envVarName,
        },
      },
      update: {
        applicationId: oauthApp.id,
        origin: spec.origin,
        owner: spec.owner,
        associatedAccount: project.domain,
        vaultCredentialId: spec.vaultCredentialId,
        requiredPermissionsJson: JSON.stringify(provider.requiredScopes),
        transferable: spec.transferable,
        handoverMode: spec.handoverMode,
        activationStatus: spec.activationStatus,
        handoverRequirements: spec.handoverRequirements,
        preparedMetadataJson: JSON.stringify(spec.preparedMetadata),
      },
      create: {
        projectId: project.id,
        providerKey: provider.key,
        credentialType: spec.credentialType,
        applicationId: oauthApp.id,
        origin: spec.origin,
        owner: spec.owner,
        associatedAccount: project.domain,
        vaultCredentialId: spec.vaultCredentialId,
        envVarName: spec.envVarName,
        requiredPermissionsJson: JSON.stringify(provider.requiredScopes),
        transferable: spec.transferable,
        handoverMode: spec.handoverMode,
        activationStatus: spec.activationStatus,
        handoverRequirements: spec.handoverRequirements,
        preparedMetadataJson: JSON.stringify(spec.preparedMetadata),
      },
    });
    savedCreds.push(rec);
  }

  // Record provider selection cleanly on project
  const selected = (() => {
    try { return JSON.parse(project.selectedProvidersJson) as string[]; } catch { return []; }
  })();
  if (!selected.includes(provider.key)) selected.push(provider.key);

  await db.integrationProject.update({
    where: { id: project.id },
    data: {
      selectedProvidersJson: JSON.stringify(selected),
      status: project.status === 'discovery' ? 'setup_prepared' : project.status,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'engineering.provider.prepare',
    target: `${project.id}:${provider.key}`,
    providerKey: provider.key,
    ip: params.ip,
    metadata: {
      executionMode: profile.executionMode,
      handoverMode: profile.handoverMode,
      credentialsPrepared: savedCreds.length,
    },
  });

  return { profile, oauthApp, credentials: savedCreds };
}
