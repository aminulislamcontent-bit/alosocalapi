export interface OverviewPayload {
  generatedAt: string;
  vaultReady: boolean;
  browserCapability: {
    playwrightAvailable: boolean;
    chromiumAvailable: boolean;
    chromiumPath: string | null;
    executionMode: string;
    note: string;
  };
  catalogSummary: {
    version: string;
    total: number;
    marketingPlatformCount: number;
    oauthSupportedCount: number;
    webhookSupportedCount: number;
    byCanonicalCategory: Record<string, number>;
    byImplementationLevel: Record<number, number>;
  };
  canonicalCategories: string[];
  implementationLevels: { level: number; code: string; label: string; description: string }[];
  onboardingStates: string[];
  agents: {
    code: string;
    id: string;
    name: string;
    role: string;
    allowedActions: string[];
    forbiddenActions: string[];
    approvalGates: string[];
  }[];
  clients: { id: string; username: string; name: string; business: string; status: string }[];
  workflows: {
    id: string;
    clientId: string;
    providerKey: string;
    state: string;
    implementationLevel: number;
    pendingCheckpoint: string | null;
    lastError: string | null;
    history: string;
    updatedAt: string;
  }[];
  profiles: {
    id: string;
    clientId: string | null;
    businessName: string;
    businessType: string;
    marketingBudget: string;
    recommendations: string;
    updatedAt: string;
  }[];
  credentials: {
    id: string;
    tenantId: string;
    providerKey: string;
    credentialType: string;
    label: string;
    keyVersion: number;
    effectiveStatus: string;
    expiresAt: string | null;
    revokedAt: string | null;
    updatedAt: string;
  }[];
  expiringCredentials: { id: string; providerKey: string; label: string; effectiveStatus: string; expiresAt: string | null }[];
  oauthStates: {
    id: string;
    clientId: string;
    providerKey: string;
    status: string;
    scopes: string;
    expiresAt: string;
    consumedAt: string | null;
    errorDetail: string | null;
    createdAt: string;
  }[];
  browserSessions: {
    id: string;
    clientId: string;
    providerKey: string;
    purpose: string;
    officialUrl: string;
    status: string;
    currentAction: string;
    nextOwnerAction: string | null;
    executionMode: string;
    auditNotes: string;
    updatedAt: string;
  }[];
  agentRuns: {
    id: string;
    agentId: string;
    agentName: string;
    clientId: string | null;
    providerKey: string | null;
    action: string;
    status: string;
    correlationId: string;
    outputSummary: string;
    complianceDecision: string;
    durationMs: number;
    createdAt: string;
  }[];
  omniEvents: {
    id: string;
    eventType: string;
    eventName: string;
    source: string;
    clientId: string | null;
    providerKey: string | null;
    correlationId: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    createdAt: string;
  }[];
  initRuns: {
    id: string;
    triggeredBy: string;
    status: string;
    steps: string;
    summary: string;
    durationMs: number;
    createdAt: string;
  }[];
  integrityRecords: {
    id: string;
    checkType: string;
    target: string;
    status: string;
    severity: string;
    detail: string;
    repaired: boolean;
    requiresApproval: boolean;
    checkedAt: string;
  }[];
  discoverySnapshots: {
    id: string;
    providerKey: string;
    sourceUrl: string;
    apiVersion: string;
    docHash: string | null;
    fetchStatus: string;
    discoveredMeta: string;
    checkedAt: string;
  }[];
  auditLogs: {
    id: string;
    actor: string;
    action: string;
    providerKey: string | null;
    detail: string;
    createdAt: string;
  }[];
  healthMetrics: {
    workflowsTotal: number;
    ownerActionPending: number;
    verifiedCount: number;
    blockedCount: number;
    vaultCredentialsCount: number;
    expiringCount: number;
    deadLetterEvents: number;
    pendingApprovalSessions: number;
  };
}

export interface CatalogProviderItem {
  key: string;
  displayName: string;
  canonicalCategory: string;
  apiVersion: string;
  authenticationType: string;
  oauthSupport: boolean;
  requiredScopes: string[];
  officialWebsite: string;
  officialDeveloperPortal: string;
  officialApiDocumentation: string;
  implementationLevel: number;
  runtimeVerificationStatus: string;
  developerAccountRequirements: string;
  businessVerificationRequirements: string;
  pricingPlanLimitations: string;
  rateLimitsAndPricing: string;
  apiBaseUrls: string[];
  adapterImplementationStatus: string;
  environmentVariables: { name: string; secret: boolean; required: boolean; purpose: string }[];
  setupChecklist: string[];
  supportedOperations: string[];
  knownLimitations: string[];
  webhookSupport: { supported: boolean; signatureMethod: string; verificationMethod: string; notes: string };
  capabilityMatrix: Record<string, string>;
  apiSpecs: { method: string; path: string; summary: string }[];
}
