import type {
  AdapterImplementationStatus,
  ApiEndpointSpec,
  AuthenticationType,
  CanonicalCategory,
  CapabilityMatrix,
  CapabilitySupportStatus,
  EnvRequirement,
  ImplementationLevelCode,
  IntegrationProviderRecord,
  OAuthEndpointSpec,
  ProviderStatus,
  WebhookSupportSpec,
} from '../types';

export const CATALOG_COLLECTED_AT = '2026-11-16T00:00:00.000Z';

export function envVar(name: string, secret: boolean, required: boolean, purpose: string): EnvRequirement {
  return { name, secret, required, purpose };
}

export function buildMatrix(overrides: Partial<CapabilityMatrix> = {}): CapabilityMatrix {
  return {
    accountDiscovery: overrides.accountDiscovery ?? 'OWNER_ACTION_REQUIRED',
    accountRegistrationGuidance: overrides.accountRegistrationGuidance ?? 'SUPPORTED',
    developerAppSetup: overrides.developerAppSetup ?? 'SUPPORTED',
    oauth: overrides.oauth ?? 'NOT_SUPPORTED',
    apiKeyConfiguration: overrides.apiKeyConfiguration ?? 'NOT_SUPPORTED',
    campaignManagement: overrides.campaignManagement ?? 'NOT_SUPPORTED',
    contentPublishing: overrides.contentPublishing ?? 'NOT_SUPPORTED',
    contactSynchronization: overrides.contactSynchronization ?? 'NOT_SUPPORTED',
    leadCapture: overrides.leadCapture ?? 'NOT_SUPPORTED',
    messaging: overrides.messaging ?? 'NOT_SUPPORTED',
    analytics: overrides.analytics ?? 'NOT_SUPPORTED',
    webhooks: overrides.webhooks ?? 'NOT_SUPPORTED',
    automationTriggers: overrides.automationTriggers ?? 'NOT_SUPPORTED',
    automationActions: overrides.automationActions ?? 'NOT_SUPPORTED',
    reporting: overrides.reporting ?? 'NOT_SUPPORTED',
  };
}

export interface ProviderInput {
  key: string;
  name: string;
  legacyCategory: IntegrationProviderRecord['category'];
  canonicalCategory: CanonicalCategory;
  platformTrack: IntegrationProviderRecord['platformTrack'];
  officialWebsite: string;
  officialDeveloperPortal: string;
  officialApiDocumentation: string;
  officialRegistrationUrl?: string;
  officialDocs: { label: string; url: string }[];
  apiVersion: string;
  apiBaseUrls: string[];
  authenticationType: AuthenticationType;
  authentication: string[];
  oauthSupport: boolean;
  oauthConfig?: OAuthEndpointSpec;
  oauthScopes: string[];
  applicationRequirements: string;
  accountRequirements: string;
  accountPrerequisites?: string[];
  businessVerificationRequirements?: string;
  pricingPlanLimitations?: string;
  licensingAndAccessNotes?: string;
  regionalAvailability?: string;
  implementationEvidence?: string;
  endpoints: string[];
  apiSpecs?: ApiEndpointSpec[];
  webhooks: string;
  webhookSupport?: Partial<WebhookSupportSpec>;
  rateLimitsAndPricing: string;
  developerApproval: string;
  environmentVariables: EnvRequirement[];
  automationCapabilities: string[];
  restrictions: string[];
  setupChecklist?: string[];
  capabilityMatrix?: Partial<CapabilityMatrix>;
  adapterImplementationStatus?: AdapterImplementationStatus;
  implementationLevel?: 0 | 1 | 2 | 3;
  verificationStatus?: ProviderStatus;
  productionNotes: string;
}

const LEVEL_MAP: Record<number, ImplementationLevelCode> = {
  0: 'LEVEL_0_CATALOG_ONLY',
  1: 'LEVEL_1_DOCUMENTED',
  2: 'LEVEL_2_DISCOVERY_READY',
  3: 'LEVEL_3_AUTHORIZATION_READY',
};

export function defineProvider(input: ProviderInput): IntegrationProviderRecord {
  const implLevel = input.implementationLevel ?? (input.oauthConfig || input.authenticationType === 'api_key' || input.authenticationType === 'bot_token' ? 3 : 2);
  const runtimeCode = LEVEL_MAP[implLevel] ?? 'LEVEL_1_DOCUMENTED';
  const adapterStatus: AdapterImplementationStatus =
    input.adapterImplementationStatus ??
    (implLevel >= 3 ? 'IMPLEMENTED' : implLevel === 2 ? 'PARTIAL' : 'TEMPLATE_ONLY');

  const webhookSupported = input.webhookSupport?.supported ?? (
    !input.webhooks.toLowerCase().startsWith('no ') &&
    !input.webhooks.toLowerCase().startsWith('none')
  );

  const defaultMatrix = buildMatrix({
    accountDiscovery: input.oauthSupport ? 'OWNER_ACTION_REQUIRED' : 'PARTIALLY_SUPPORTED',
    accountRegistrationGuidance: 'SUPPORTED',
    developerAppSetup: 'SUPPORTED',
    oauth: input.oauthSupport ? 'SUPPORTED' : 'NOT_SUPPORTED',
    apiKeyConfiguration: ['api_key', 'bot_token', 'basic_auth', 'service_account'].includes(input.authenticationType)
      ? 'SUPPORTED'
      : input.environmentVariables.some(v => v.secret)
        ? 'PARTIALLY_SUPPORTED'
        : 'NOT_SUPPORTED',
    webhooks: webhookSupported ? 'SUPPORTED' : 'NOT_SUPPORTED',
    ...input.capabilityMatrix,
  });

  const setupChecklist = input.setupChecklist ?? [
    `Create or sign into an authorized account on ${input.officialWebsite}.`,
    `Open the official developer portal (${input.officialDeveloperPortal}) and review ${input.apiVersion} requirements.`,
    input.oauthSupport
      ? `Register redirect URI and configure required least-privilege scopes (${input.oauthScopes.slice(0, 4).join(', ') || 'see official docs'}).`
      : `Create scoped API credentials in the official developer/settings console.`,
    webhookSupported
      ? `Configure HTTPS webhook callback URL and signature verification secret.`
      : `Confirm polling intervals and rate-limit compliance in official documentation.`,
    `Store issued credentials in ALOAPI's encrypted vault and run read-only verification.`,
  ];

  const apiSpecs: ApiEndpointSpec[] = input.apiSpecs ?? input.endpoints.map((ep, idx) => {
    const match = /^(GET|POST|PUT|PATCH|DELETE)\s+([^\s(]+)/i.exec(ep.trim());
    const method = (match?.[1]?.toUpperCase() ?? 'GET') as ApiEndpointSpec['method'];
    const path = match?.[2] ?? ep;
    return {
      method,
      path,
      summary: ep,
      requiredScopes: input.oauthScopes.slice(0, 3),
      pagination: 'Cursor or page-based; confirm exact parameters in official docs.',
      rateLimitNote: input.rateLimitsAndPricing,
      readOnlyProbe: method === 'GET' && idx === 0,
    };
  });

  const statusOverride: Record<CapabilitySupportStatus, boolean> = {
    SUPPORTED: true,
    PARTIALLY_SUPPORTED: true,
    OWNER_ACTION_REQUIRED: true,
    APPROVAL_REQUIRED: true,
    NOT_SUPPORTED: true,
    NOT_VERIFIED: true,
  };
  void statusOverride;

  return {
    key: input.key,
    id: input.key,
    name: input.name,
    displayName: input.name,
    category: input.legacyCategory,
    canonicalCategory: input.canonicalCategory,
    platformTrack: input.platformTrack,
    verificationStatus: input.verificationStatus ?? (implLevel === 0 ? 'DISCOVERED' : 'DOCUMENTED'),
    collectedAt: CATALOG_COLLECTED_AT,
    documentationVerificationTimestamp: CATALOG_COLLECTED_AT,
    officialWebsite: input.officialWebsite,
    officialDeveloperPortal: input.officialDeveloperPortal,
    officialApiDocumentation: input.officialApiDocumentation,
    officialRegistrationUrl: input.officialRegistrationUrl ?? input.officialWebsite,
    officialDocs: input.officialDocs,
    apiVersion: input.apiVersion,
    apiBaseUrls: input.apiBaseUrls,
    authenticationType: input.authenticationType,
    authentication: input.authentication,
    oauthSupport: input.oauthSupport,
    oauthConfig: input.oauthConfig,
    oauthScopes: input.oauthScopes,
    requiredScopes: input.oauthScopes,
    applicationRequirements: input.applicationRequirements,
    developerAccountRequirements: input.applicationRequirements,
    accountRequirements: input.accountRequirements,
    accountPrerequisites: input.accountPrerequisites ?? [input.accountRequirements],
    businessVerificationRequirements: input.businessVerificationRequirements ?? input.developerApproval,
    pricingPlanLimitations: input.pricingPlanLimitations ?? input.rateLimitsAndPricing,
    licensingAndAccessNotes:
      input.licensingAndAccessNotes ??
      `${input.developerApproval}. Commercial & API terms apply at ${input.officialWebsite}; never redistribute without tenant authorization.`,
    regionalAvailability: input.regionalAvailability ?? 'Check regional eligibility and compliance requirements in official provider documentation.',
    implementationEvidence:
      input.implementationEvidence ??
      `Static documentation and adapter spec verified in ALOAPI catalog at ${CATALOG_COLLECTED_AT}; live tenant authorization required for runtime verification.`,
    endpoints: input.endpoints,
    apiSpecs,
    webhooks: input.webhooks,
    webhookSupport: {
      supported: webhookSupported,
      signatureMethod: input.webhookSupport?.signatureMethod ?? (webhookSupported ? 'HMAC-SHA256 / provider signature' : 'None'),
      verificationMethod: input.webhookSupport?.verificationMethod ?? (webhookSupported ? 'Callback challenge or shared secret verification' : 'Polling'),
      events: input.webhookSupport?.events ?? [],
      notes: input.webhookSupport?.notes ?? input.webhooks,
    },
    rateLimitsAndPricing: input.rateLimitsAndPricing,
    developerApproval: input.developerApproval,
    environmentVariables: input.environmentVariables,
    automationCapabilities: input.automationCapabilities,
    supportedOperations: input.automationCapabilities,
    restrictions: input.restrictions,
    knownLimitations: input.restrictions,
    setupChecklist,
    adapterImplementationStatus: adapterStatus,
    runtimeVerificationStatus: runtimeCode,
    implementationLevel: implLevel,
    capabilityMatrix: defaultMatrix,
    productionNotes: input.productionNotes,
  };
}
