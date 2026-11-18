import { getProviderByKey } from '@/lib/intelligence/catalog';
import { PLATFORM_SPECIFIC_PLAYBOOKS } from './recommendations';
import { listVaultCredentialsMetadata } from './vault-service';
import { db } from '@/lib/db';

export type IntegrationIdentityInput =
  | { kind: 'url'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'account'; value: string };

/** Owner checkpoints that automation must never bypass or silently satisfy. */
export const OWNER_CHECKPOINTS = [
  'Sign in and verify the account directly on the provider official origin; ALOAPI never collects passwords, OTPs, MFA codes, recovery codes or session cookies.',
  'Complete CAPTCHA, business verification, developer-app review, legal acceptance, billing and scope elevation manually.',
  'Approve publishing, messaging consent, sending, payment and other irreversible actions explicitly.',
  'Approve any encrypted credential transfer through an owner-authorized secure channel.',
] as const;

export function normalizeIdentity(input: IntegrationIdentityInput) {
  const value = input.value.trim();
  if (!value || value.length > 2048) throw new Error('A valid account URL, phone number, or account identifier is required.');
  if (input.kind === 'url') {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('Enter a valid HTTPS account/page URL.');
    }
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS account/page URLs are accepted.');
    if (parsed.username || parsed.password) throw new Error('Account URLs must not contain embedded credentials.');
    return { kind: input.kind, value: parsed.toString(), hostname: parsed.hostname.toLowerCase() };
  }
  if (input.kind === 'phone') {
    // Strip only human formatting (spaces, parentheses, dots and unicode dashes),
    // then require an explicit international country code and emit true E.164.
    const cleaned = value.replace(/[\s\u00A0().\-\u2010-\u2015]/g, '');
    const phone = cleaned.startsWith('00')
      ? `+${cleaned.slice(2)}`
      : cleaned.startsWith('+')
        ? cleaned
        : `+${cleaned}`;
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new Error('Enter a phone number in international E.164 format with a country code, for example +8801712345678.');
    }
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
  const requiredCredentialTypes = Array.from(new Set([
    ...provider.environmentVariables.filter(v => v.required).map(v => v.name),
    ...(provider.oauthSupport ? ['oauth_client_id', 'oauth_client_secret', 'oauth_access_token'] : []),
    ...(provider.webhookSupport.supported ? ['webhook_signing_secret', 'webhook_verify_token'] : []),
  ]));
  const credentialStatus = requiredCredentialTypes.map(type => {
    const matching = credentials.filter(c => c.credentialType === type || c.credentialType.toLowerCase() === type.toLowerCase());
    return {
      credentialType: type,
      status: matching.some(c => c.effectiveStatus === 'ACTIVE') ? 'COLLECTED_ENCRYPTED' : 'OWNER_OR_AGENT_ACTION_REQUIRED',
      records: matching.map(c => ({
        id: c.id,
        label: c.label,
        status: c.effectiveStatus,
        expiresAt: c.expiresAt,
        scopes: c.scopesList,
      })),
    };
  });
  const requiredOwnerActions = Array.from(new Set([
    ...provider.accountPrerequisites,
    ...provider.setupChecklist,
    ...(playbook?.prerequisites ?? []),
  ]));
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
      requiredOwnerActions,
      ownerCheckpoints: OWNER_CHECKPOINTS,
    },
    handover: {
      secretsIncluded: false,
      vaultCredentialCount: credentials.length,
      credentialStatus,
      requiredOwnerActions,
      ownerCheckpoints: OWNER_CHECKPOINTS,
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
      lastVerifiedAt: workflow?.updatedAt?.toISOString() ?? null,
      claim: verified ? 'The onboarding workflow is marked VERIFIED.' : 'No live verification success is claimed by this package.',
    },
  };
}
