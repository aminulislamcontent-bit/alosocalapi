export type ProviderStatus =
  | 'DISCOVERED'
  | 'DOCUMENTED'
  | 'CONFIGURED'
  | 'AUTHORIZED'
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'BLOCKED'
  | 'REQUIRES_USER_ACTION';

export type CanonicalCategory =
  | 'Social Media and Publishing'
  | 'Messaging and Customer Communication'
  | 'Paid Advertising'
  | 'Email Marketing'
  | 'CRM and Sales'
  | 'SEO and Website Marketing'
  | 'Analytics and Customer Data'
  | 'Ecommerce and Marketplace'
  | 'Workflow Automation'
  | 'Forms, Landing Pages and Scheduling';

export const CANONICAL_CATEGORIES: readonly CanonicalCategory[] = [
  'Social Media and Publishing',
  'Messaging and Customer Communication',
  'Paid Advertising',
  'Email Marketing',
  'CRM and Sales',
  'SEO and Website Marketing',
  'Analytics and Customer Data',
  'Ecommerce and Marketplace',
  'Workflow Automation',
  'Forms, Landing Pages and Scheduling',
] as const;

export type ImplementationLevelCode =
  | 'LEVEL_0_CATALOG_ONLY'
  | 'LEVEL_1_DOCUMENTED'
  | 'LEVEL_2_DISCOVERY_READY'
  | 'LEVEL_3_AUTHORIZATION_READY'
  | 'LEVEL_4_CONNECTED'
  | 'LEVEL_5_CONFIGURED'
  | 'LEVEL_6_API_VERIFIED'
  | 'LEVEL_7_PRODUCTION_READY';

export const IMPLEMENTATION_LEVELS: readonly {
  level: number;
  code: ImplementationLevelCode;
  label: string;
  description: string;
}[] = [
  { level: 0, code: 'LEVEL_0_CATALOG_ONLY', label: 'Level 0 — Catalog Only', description: 'Provider is listed, but no technical discovery is verified.' },
  { level: 1, code: 'LEVEL_1_DOCUMENTED', label: 'Level 1 — Documented', description: 'Official API documentation and authentication requirements are recorded.' },
  { level: 2, code: 'LEVEL_2_DISCOVERY_READY', label: 'Level 2 — Discovery Ready', description: 'Setup wizard, scopes, requirements, and configuration templates exist.' },
  { level: 3, code: 'LEVEL_3_AUTHORIZATION_READY', label: 'Level 3 — Authorization Ready', description: 'Official OAuth or authorization flow is implemented.' },
  { level: 4, code: 'LEVEL_4_CONNECTED', label: 'Level 4 — Connected', description: 'The owner has authorized the provider.' },
  { level: 5, code: 'LEVEL_5_CONFIGURED', label: 'Level 5 — Configured', description: 'Required account IDs, permissions, and webhook settings are configured.' },
  { level: 6, code: 'LEVEL_6_API_VERIFIED', label: 'Level 6 — API Verified', description: 'A real API test has succeeded.' },
  { level: 7, code: 'LEVEL_7_PRODUCTION_READY', label: 'Level 7 — Production Ready', description: 'Error handling, security, rate limits, retries, and operational tests have passed.' },
];

export type CapabilitySupportStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'OWNER_ACTION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'NOT_SUPPORTED'
  | 'NOT_VERIFIED';

export const CAPABILITY_KEYS = [
  'accountDiscovery',
  'accountRegistrationGuidance',
  'developerAppSetup',
  'oauth',
  'apiKeyConfiguration',
  'campaignManagement',
  'contentPublishing',
  'contactSynchronization',
  'leadCapture',
  'messaging',
  'analytics',
  'webhooks',
  'automationTriggers',
  'automationActions',
  'reporting',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type CapabilityMatrix = Record<CapabilityKey, CapabilitySupportStatus>;

export type AuthenticationType =
  | 'oauth2'
  | 'oauth2_pkce'
  | 'api_key'
  | 'bot_token'
  | 'service_account'
  | 'basic_auth'
  | 'hmac_webhook'
  | 'manual_review';

export type AdapterImplementationStatus = 'IMPLEMENTED' | 'PARTIAL' | 'TEMPLATE_ONLY' | 'PLANNED';

export interface EnvRequirement {
  name: string;
  secret: boolean;
  required: boolean;
  purpose: string;
}

export interface OAuthEndpointSpec {
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  pkceSupported: boolean;
  scopeSeparator: ' ' | ',';
  clientIdParam?: string;
  extraAuthParams?: Record<string, string>;
}

export interface ApiEndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  requiredScopes?: string[];
  requiredParams?: string[];
  pagination?: string;
  rateLimitNote?: string;
  requestSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  exampleRequest?: {
    url: string;
    headers: Record<string, string>;
    body?: Record<string, unknown>;
  };
  readOnlyProbe?: boolean;
}

export interface WebhookSupportSpec {
  supported: boolean;
  signatureMethod: string;
  verificationMethod: string;
  events: string[];
  notes: string;
}

export interface IntegrationProviderRecord {
  // Preserved legacy fields
  key: string;
  name: string;
  category: 'social' | 'marketing' | 'business' | 'automation' | 'agent-library' | 'infrastructure' | 'research';
  verificationStatus: ProviderStatus;
  collectedAt: string;
  officialDocs: { label: string; url: string }[];
  apiBaseUrls: string[];
  authentication: string[];
  oauthScopes: string[];
  applicationRequirements: string;
  accountRequirements: string;
  endpoints: string[];
  webhooks: string;
  rateLimitsAndPricing: string;
  developerApproval: string;
  environmentVariables: EnvRequirement[];
  automationCapabilities: string[];
  restrictions: string[];
  productionNotes: string;

  // Master Production Spec (Section 2, 3, 8, 10, 11) fields
  id: string;
  displayName: string;
  canonicalCategory: CanonicalCategory;
  officialWebsite: string;
  officialDeveloperPortal: string;
  officialApiDocumentation: string;
  apiVersion: string;
  authenticationType: AuthenticationType;
  oauthSupport: boolean;
  oauthConfig?: OAuthEndpointSpec;
  requiredScopes: string[];
  webhookSupport: WebhookSupportSpec;
  accountPrerequisites: string[];
  developerAccountRequirements: string;
  businessVerificationRequirements: string;
  pricingPlanLimitations: string;
  regionalAvailability: string;
  setupChecklist: string[];
  supportedOperations: string[];
  knownLimitations: string[];
  documentationVerificationTimestamp: string;
  adapterImplementationStatus: AdapterImplementationStatus;
  runtimeVerificationStatus: ImplementationLevelCode;
  implementationLevel: number;
  capabilityMatrix: CapabilityMatrix;
  apiSpecs: ApiEndpointSpec[];
  platformTrack:
    | 'meta'
    | 'google'
    | 'tiktok'
    | 'linkedin'
    | 'email'
    | 'crm'
    | 'messaging'
    | 'ecommerce'
    | 'analytics'
    | 'seo'
    | 'automation'
    | 'forms'
    | 'social';
  officialRegistrationUrl?: string;
}
