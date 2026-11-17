-- Additive ALOAPI Autonomous Onboarding, Multi-Agent, OAuth, Omni-Routing, and Self-Healing tables.
-- Existing CRM, Growth Engine, SetupBot, Security, and Integration Intelligence rows remain untouched.

CREATE TABLE "OnboardingWorkflow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "implementationLevel" INTEGER NOT NULL DEFAULT 1,
  "ownerEmail" TEXT,
  "businessName" TEXT,
  "accountExistsDetected" BOOLEAN NOT NULL DEFAULT false,
  "registrationMethod" TEXT NOT NULL DEFAULT 'GUIDED_MANUAL',
  "preparedPayload" TEXT NOT NULL DEFAULT '{}',
  "developerAppConfig" TEXT NOT NULL DEFAULT '{}',
  "pendingCheckpoint" TEXT,
  "ownerApprovedAt" DATETIME,
  "ownerApprovedBy" TEXT,
  "lastError" TEXT,
  "history" TEXT NOT NULL DEFAULT '[]',
  "correlationId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "OnboardingWorkflow_clientId_providerKey_key" ON "OnboardingWorkflow"("clientId", "providerKey");
CREATE INDEX "OnboardingWorkflow_providerKey_state_idx" ON "OnboardingWorkflow"("providerKey", "state");
CREATE INDEX "OnboardingWorkflow_state_idx" ON "OnboardingWorkflow"("state");

CREATE TABLE "ClientRequirementProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT,
  "businessName" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "businessLocation" TEXT NOT NULL,
  "targetMarket" TEXT NOT NULL,
  "targetAudience" TEXT NOT NULL,
  "marketingBudget" TEXT NOT NULL,
  "monthlyContactVolume" INTEGER NOT NULL DEFAULT 0,
  "advertisingBudget" TEXT NOT NULL,
  "socialMediaChannels" TEXT NOT NULL DEFAULT '[]',
  "emailRequirements" TEXT NOT NULL DEFAULT '{}',
  "messagingRequirements" TEXT NOT NULL DEFAULT '{}',
  "crmRequirements" TEXT NOT NULL DEFAULT '{}',
  "ecommerceRequirements" TEXT NOT NULL DEFAULT '{}',
  "automationComplexity" TEXT NOT NULL DEFAULT 'medium',
  "reportingRequirements" TEXT NOT NULL DEFAULT '{}',
  "recommendations" TEXT NOT NULL DEFAULT '{}',
  "selectedProviders" TEXT NOT NULL DEFAULT '[]',
  "approvedProviders" TEXT NOT NULL DEFAULT '[]',
  "approvedBy" TEXT,
  "approvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "ClientRequirementProfile_clientId_idx" ON "ClientRequirementProfile"("clientId");

CREATE TABLE "VaultCredential" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "credentialType" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT 'default',
  "ciphertext" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "expiresAt" DATETIME,
  "refreshable" BOOLEAN NOT NULL DEFAULT false,
  "revokedAt" DATETIME,
  "revokedReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastVerifiedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "VaultCredential_clientId_providerKey_credentialType_label_key" ON "VaultCredential"("clientId", "providerKey", "credentialType", "label");
CREATE INDEX "VaultCredential_clientId_providerKey_idx" ON "VaultCredential"("clientId", "providerKey");
CREATE INDEX "VaultCredential_status_expiresAt_idx" ON "VaultCredential"("status", "expiresAt");

CREATE TABLE "OAuthAuthorizationState" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "state" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "codeVerifierCiphertext" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "errorDetail" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OAuthAuthorizationState_state_key" ON "OAuthAuthorizationState"("state");
CREATE INDEX "OAuthAuthorizationState_clientId_providerKey_idx" ON "OAuthAuthorizationState"("clientId", "providerKey");
CREATE INDEX "OAuthAuthorizationState_expiresAt_idx" ON "OAuthAuthorizationState"("expiresAt");

CREATE TABLE "BrowserWorkflowSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "workflowId" TEXT,
  "purpose" TEXT NOT NULL,
  "officialUrl" TEXT NOT NULL,
  "contextKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "currentAction" TEXT NOT NULL,
  "nextOwnerAction" TEXT,
  "executionMode" TEXT NOT NULL DEFAULT 'guided_browser_handoff',
  "auditNotes" TEXT NOT NULL DEFAULT '[]',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "BrowserWorkflowSession_clientId_providerKey_idx" ON "BrowserWorkflowSession"("clientId", "providerKey");
CREATE INDEX "BrowserWorkflowSession_status_idx" ON "BrowserWorkflowSession"("status");

CREATE TABLE "AgentExecutionRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  "clientId" TEXT,
  "providerKey" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "correlationId" TEXT NOT NULL,
  "inputSummary" TEXT NOT NULL DEFAULT '{}',
  "outputSummary" TEXT NOT NULL DEFAULT '{}',
  "complianceDecision" TEXT NOT NULL DEFAULT 'ALLOWED',
  "complianceReason" TEXT,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AgentExecutionRun_agentId_createdAt_idx" ON "AgentExecutionRun"("agentId", "createdAt");
CREATE INDEX "AgentExecutionRun_clientId_providerKey_idx" ON "AgentExecutionRun"("clientId", "providerKey");
CREATE INDEX "AgentExecutionRun_correlationId_idx" ON "AgentExecutionRun"("correlationId");

CREATE TABLE "OmniEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "clientId" TEXT,
  "providerKey" TEXT,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextAttemptAt" DATETIME,
  "lastError" TEXT,
  "processedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "OmniEvent_idempotencyKey_key" ON "OmniEvent"("idempotencyKey");
CREATE INDEX "OmniEvent_eventType_status_idx" ON "OmniEvent"("eventType", "status");
CREATE INDEX "OmniEvent_correlationId_idx" ON "OmniEvent"("correlationId");
CREATE INDEX "OmniEvent_status_nextAttemptAt_idx" ON "OmniEvent"("status", "nextAttemptAt");

CREATE TABLE "SystemInitializationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "triggeredBy" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "steps" TEXT NOT NULL DEFAULT '[]',
  "summary" TEXT NOT NULL DEFAULT '{}',
  "idempotent" BOOLEAN NOT NULL DEFAULT true,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SystemInitializationRun_createdAt_idx" ON "SystemInitializationRun"("createdAt");

CREATE TABLE "SystemIntegrityRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checkType" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "detail" TEXT NOT NULL,
  "repaired" BOOLEAN NOT NULL DEFAULT false,
  "backupPath" TEXT,
  "verifiedAfterRepair" BOOLEAN NOT NULL DEFAULT false,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SystemIntegrityRecord_checkType_status_idx" ON "SystemIntegrityRecord"("checkType", "status");
CREATE INDEX "SystemIntegrityRecord_checkedAt_idx" ON "SystemIntegrityRecord"("checkedAt");

CREATE TABLE "ApiDiscoverySnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerKey" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "apiVersion" TEXT NOT NULL,
  "docHash" TEXT,
  "previousHash" TEXT,
  "changed" BOOLEAN NOT NULL DEFAULT false,
  "fetchStatus" TEXT NOT NULL,
  "discoveredMeta" TEXT NOT NULL DEFAULT '{}',
  "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ApiDiscoverySnapshot_providerKey_checkedAt_idx" ON "ApiDiscoverySnapshot"("providerKey", "checkedAt");
