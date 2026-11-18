import { getProviderByKey } from '@/lib/intelligence/catalog';
import { PLATFORM_SPECIFIC_PLAYBOOKS } from './recommendations';
import { listVaultCredentialsMetadata } from './vault-service';
import { db } from '@/lib/db';

export type IntegrationIdentityInput =
  | { kind: 'url'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'account'; value: string };

function normalizeIdentity(input: IntegrationIdentityInput) {
  const value = input.value.trim();
  if (!value || value.length > 2048) throw new Error('A valid account URL, phone number, or account identifier is required.');
  if (input.kind === 'url') {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS account/page URLs are accepted.');
    return { kind: input.kind, value: parsed.toString(), hostname: parsed.hostname.toLowerCase() };
  }
  if (input.kind === 'phone') {
    const phone = value.replace(/[\\s().-]/g, '');
    if (!/^\\+[1-9]\\d{7,14}$/.test(phone)) throw new Error('Enter a phone number in international E.164 format, including the leading +.');
    return { kind: input.kind, value: phone };
  }
  return { kind: input.kind, value };
}

/**
 * Creates a truthful, tenant-scoped preparation manifest. It never claims that
 * provider credentials exist until their metadata is present in the encrypted vault.
 */
export async function buildIntegrationHandoverPackage(params: {
  tenantId: string;
  providerKey: string;
  identity: IntegrationIdentityInput;
}) {
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error('Unknown provider. Select a provider from the ALOAPI catalog.');
  const identity = normalizeIdentity(params.identity);
  const [credentials, workflow] = await Promise.all([
    listVaultCredentialsMetadata(params.tenantId, provider.key),
    db.onboardingWorkflow.findUnique({
      where: { clientId_providerKey: { clientId: params.tenantId, providerKey: provider.key } },
    }),
  ]);
  const playbook = PLATFORM_SPECIFIC_PLAYBOOKS.find(p => p.appliesToProviders.includes(provider.key));
  const credentialTypeForEnvironmentVariable = (name: string, secret: boolean) => {
    if (!secret) return 'config_value';
    if (/CLIENT_ID|APP_ID|APPLICATION_ID|CLIENT_KEY/i.test(name)) return 'oauth_client_id';
    if (/CLIENT_SECRET|APP_SECRET/i.test(name)) return 'oauth_client_secret';
    if (/REFRESH_TOKEN/i.test(name)) return 'oauth_refresh_token';
    if (/ACCESS_TOKEN/i.test(name)) return 'oauth_access_token';
    if (/SERVICE_ACCOUNT/i.test(name)) return 'service_account';
    if (/BOT_TOKEN/i.test(name)) return 'bot_token';
    if (/API_KEY|APIKEY/i.test(name)) return 'api_key';
    return 'api_key';
  };
  const requiredCredentialTypes = Array.from(new Set([
    ...provider.environmentVariables.filter(v => v.required).map(v => credentialTypeForEnvironmentVariable(v.name, v.secret)),
    ...(provider.oauthSupport ? ['oauth_client_id', 'oauth_client_secret', 'oauth_access_token'] : []),
    ...(provider.webhookSupport.supported ? ['webhook_signing_secret'] : []),
  ]));
  const credentialStatus = requiredCredentialTypes.map(type => {
    const matching = credentials.filter(c => c.credentialType === type);
    const isConfiguration = type === 'config_value';
    return {
      credentialType: type,
      status: isConfiguration ? 'CONFIGURATION_REQUIRED' : matching.some(c => c.effectiveStatus === 'ACTIVE') ? 'COLLECTED_ENCRYPTED' : 'OWNER_OR_AGENT_ACTION_REQUIRED',
      records: matching.map(c => ({
        id: c.id,
        label: c.label,
        status: c.effectiveStatus,
        expiresAt: c.expiresAt,
        scopes: c.scopesList,
      })),
    };
  });
  const approvals = [
    provider.developerAccountRequirements,
    provider.businessVerificationRequirements,
    provider.developerApproval,
    ...(playbook?.securityAndComplianceNotes ?? []),
  ].filter(Boolean);
  const configuredCount = credentialStatus.filter(c => c.status === 'COLLECTED_ENCRYPTED').length;
  const allCredentialTypesPresent = credentialStatus.length > 0 && configuredCount === credentialStatus.length;
  const verified = workflow?.state === 'VERIFIED';

  return {
    schemaVersion: 'aloapi.integration-handover.v1',
    generatedAt: new Date().toISOString(),
    tenantId: params.tenantId,
    provider: {
      key: provider.key,
      name: provider.displayName,
      category: provider.canonicalCategory,
      officialWebsite: provider.officialWebsite,
      developerPortal: provider.officialDeveloperPortal,
      apiDocumentation: provider.officialApiDocumentation,
      apiVersion: provider.apiVersion,
      authenticationType: provider.authenticationType,
      implementationLevel: provider.implementationLevel,
      adapterStatus: provider.adapterImplementationStatus,
      runtimeVerificationStatus: provider.runtimeVerificationStatus,
    },
    suppliedIdentity: identity,
    preparation: {
      status: verified ? 'API_VERIFIED' : allCredentialTypesPresent ? 'CREDENTIALS_COLLECTED_VERIFICATION_PENDING' : 'DISCOVERY_AND_SETUP_REQUIRED',
      workflowState: workflow?.state ?? 'NOT_STARTED',
      requiredScopes: provider.requiredScopes,
      requiredCredentials: credentialStatus,
      accountPrerequisites: provider.accountPrerequisites,
      developerRequirements: provider.developerAccountRequirements,
      businessVerification: provider.businessVerificationRequirements,
      pricingAndLimits: provider.pricingPlanLimitations,
      setupChecklist: provider.setupChecklist,
      platformPlaybook: playbook ? {
        title: playbook.title,
        prerequisites: playbook.prerequisites,
        steps: playbook.steps,
        securityAndComplianceNotes: playbook.securityAndComplianceNotes,
      } : null,
      endpoints: provider.apiSpecs,
      webhooks: provider.webhookSupport,
      environmentVariables: provider.environmentVariables,
      supportedOperations: provider.supportedOperations,
      knownLimitations: provider.knownLimitations,
      ownerApprovalsAndRestrictions: approvals,
    },
    handover: {
      secretsIncluded: false,
      vaultCredentialCount: credentials.length,
      credentialStatus,
      nextSteps: [
        'Complete login and verification directly on the provider official website; never submit passwords or OTPs to ALOAPI.',
        'Complete any provider-required business, developer, app-review, or permission approvals.',
        'Authorize only the minimum required scopes through the official OAuth consent flow.',
        'Collect provider-issued credentials through supported official flows and store them in the encrypted ALOAPI Vault.',
        'Run a real read-only API verification before marking this integration verified.',
        'Export this handover package and transfer credentials only through an owner-approved secure channel.',
      ],
    },
    verification: {
      verified,
      lastVerifiedAt: credentials.find(c => c.lastVerifiedAt)?.lastVerifiedAt?.toISOString() ?? null,
      claim: verified ? 'The onboarding workflow is marked VERIFIED.' : 'No live verification success is claimed by this package.',
    },
  };
}
