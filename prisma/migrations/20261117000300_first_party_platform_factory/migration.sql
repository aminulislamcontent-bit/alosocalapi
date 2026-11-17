-- CreateTable
CREATE TABLE "FactoryWorkspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planTier" TEXT NOT NULL DEFAULT 'growth',
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownerUsername" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FactoryWorkspaceMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryWorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryProviderConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_authorization',
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "configMeta" TEXT NOT NULL DEFAULT '{}',
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "lastVerifiedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryProviderConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledFor" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" DATETIME,
    "lastError" TEXT,
    "result" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryUsageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitCostUsd" REAL NOT NULL DEFAULT 0,
    "totalCostUsd" REAL NOT NULL DEFAULT 0,
    "adapter" TEXT NOT NULL DEFAULT 'local',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FactoryUsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryModuleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "adapterMode" TEXT NOT NULL DEFAULT 'local',
    "config" TEXT NOT NULL DEFAULT '{}',
    "operationalStatus" TEXT NOT NULL DEFAULT 'READY',
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryModuleConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryModuleRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "data" TEXT NOT NULL DEFAULT '{}',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "scheduledFor" DATETIME,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryModuleRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailSendingDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dkimSelector" TEXT NOT NULL DEFAULT 'aloapi1',
    "spfStatus" TEXT NOT NULL DEFAULT 'unverified',
    "dkimStatus" TEXT NOT NULL DEFAULT 'unverified',
    "dmarcStatus" TEXT NOT NULL DEFAULT 'unverified',
    "spfRecord" TEXT NOT NULL DEFAULT 'v=spf1 ~all',
    "dkimPublicKeyHint" TEXT,
    "dmarcPolicy" TEXT NOT NULL DEFAULT 'v=DMARC1; p=quarantine;',
    "reputationScore" REAL NOT NULL DEFAULT 100,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedForProduction" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailSendingDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "segment" TEXT NOT NULL DEFAULT 'general',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "consentStatus" TEXT NOT NULL DEFAULT 'pending',
    "consentSource" TEXT NOT NULL DEFAULT 'manual',
    "consentAt" DATETIME,
    "suppressedAt" DATETIME,
    "suppressionReason" TEXT,
    "unsubscribeToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "variables" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domainId" TEXT,
    "templateId" TEXT,
    "segment" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "adapterType" TEXT NOT NULL DEFAULT 'smtp_custom',
    "providerKey" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "scheduledFor" DATETIME,
    "sentAt" DATETIME,
    "stats" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailCampaign_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "EmailSendingDomain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailDeliveryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "adapterUsed" TEXT NOT NULL,
    "bounceType" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailDeliveryEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceCompliancePolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "allowedStartHour" INTEGER NOT NULL DEFAULT 9,
    "allowedEndHour" INTEGER NOT NULL DEFAULT 20,
    "requireExplicitConsent" BOOLEAN NOT NULL DEFAULT true,
    "requireRecordingDisclosure" BOOLEAN NOT NULL DEFAULT true,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'bn',
    "disclosureScripts" TEXT NOT NULL DEFAULT '{}',
    "sipDomain" TEXT,
    "sipTransport" TEXT NOT NULL DEFAULT 'TLS',
    "maxDurationSeconds" INTEGER NOT NULL DEFAULT 600,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceCompliancePolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceConsentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "consentStatus" TEXT NOT NULL DEFAULT 'pending',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'bn',
    "consentProof" TEXT,
    "optedOutAt" DATETIME,
    "optOutReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceConsentRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceAgentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'bn',
    "greeting" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "sttAdapter" TEXT NOT NULL DEFAULT 'local_deterministic',
    "ttsAdapter" TEXT NOT NULL DEFAULT 'local_deterministic',
    "llmAdapter" TEXT NOT NULL DEFAULT 'local_deterministic',
    "providerKey" TEXT,
    "handoffTarget" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceAgentProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceCallSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "phoneE164" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'bn',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "telephonyAdapter" TEXT NOT NULL DEFAULT 'sip_trunk',
    "providerKey" TEXT,
    "consentVerified" BOOLEAN NOT NULL DEFAULT false,
    "callingHoursVerified" BOOLEAN NOT NULL DEFAULT false,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "recordingDisclosed" BOOLEAN NOT NULL DEFAULT false,
    "disclosurePlayedAt" DATETIME,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "turnsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "sentiment" TEXT,
    "outcome" TEXT,
    "handoffReason" TEXT,
    "blockedReason" TEXT,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceCallSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceCallSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "VoiceAgentProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryAutomationWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "nodesJson" TEXT NOT NULL DEFAULT '[]',
    "edgesJson" TEXT NOT NULL DEFAULT '[]',
    "retryPolicyJson" TEXT NOT NULL DEFAULT '{}',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryAutomationWorkflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryAutomationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentNodeId" TEXT,
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "stepLogsJson" TEXT NOT NULL DEFAULT '[]',
    "pendingApprovalNode" TEXT,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" DATETIME,
    "lastError" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryAutomationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FactoryAutomationRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "FactoryAutomationWorkflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryCrmOrganization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "countryCode" TEXT,
    "sizeBand" TEXT,
    "ownerUsername" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryCrmOrganization_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryCrmContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "consentStatus" TEXT NOT NULL DEFAULT 'not_collected',
    "assignedTo" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "nextFollowUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryCrmContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FactoryCrmContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FactoryCrmOrganization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryCrmOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL DEFAULT 'default',
    "stage" TEXT NOT NULL DEFAULT 'qualified',
    "valueUsd" REAL NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 25,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT,
    "expectedCloseAt" DATETIME,
    "nextFollowUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryCrmOpportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FactoryCrmOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "FactoryCrmOrganization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FactoryCrmOpportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FactoryCrmContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryCrmActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "activityType" TEXT NOT NULL DEFAULT 'note',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "dueAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FactoryCrmActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FactoryWorkspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FactoryCrmActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "FactoryCrmContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FactoryCrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "FactoryCrmOpportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FactoryWorkspace_slug_key" ON "FactoryWorkspace"("slug");

-- CreateIndex
CREATE INDEX "FactoryWorkspace_ownerUsername_idx" ON "FactoryWorkspace"("ownerUsername");

-- CreateIndex
CREATE INDEX "FactoryWorkspaceMember_username_status_idx" ON "FactoryWorkspaceMember"("username", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryWorkspaceMember_workspaceId_username_key" ON "FactoryWorkspaceMember"("workspaceId", "username");

-- CreateIndex
CREATE INDEX "FactoryProviderConnection_workspaceId_status_idx" ON "FactoryProviderConnection"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryProviderConnection_workspaceId_moduleKey_providerKey_key" ON "FactoryProviderConnection"("workspaceId", "moduleKey", "providerKey");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryJob_idempotencyKey_key" ON "FactoryJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FactoryJob_workspaceId_moduleKey_status_idx" ON "FactoryJob"("workspaceId", "moduleKey", "status");

-- CreateIndex
CREATE INDEX "FactoryJob_status_scheduledFor_idx" ON "FactoryJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "FactoryUsageEvent_workspaceId_moduleKey_createdAt_idx" ON "FactoryUsageEvent"("workspaceId", "moduleKey", "createdAt");

-- CreateIndex
CREATE INDEX "FactoryModuleConfig_moduleKey_operationalStatus_idx" ON "FactoryModuleConfig"("moduleKey", "operationalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryModuleConfig_workspaceId_moduleKey_key" ON "FactoryModuleConfig"("workspaceId", "moduleKey");

-- CreateIndex
CREATE INDEX "FactoryModuleRecord_workspaceId_moduleKey_status_idx" ON "FactoryModuleRecord"("workspaceId", "moduleKey", "status");

-- CreateIndex
CREATE INDEX "FactoryModuleRecord_moduleKey_recordType_idx" ON "FactoryModuleRecord"("moduleKey", "recordType");

-- CreateIndex
CREATE INDEX "EmailSendingDomain_workspaceId_verifiedForProduction_idx" ON "EmailSendingDomain"("workspaceId", "verifiedForProduction");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSendingDomain_workspaceId_domain_key" ON "EmailSendingDomain"("workspaceId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "EmailContact_unsubscribeToken_key" ON "EmailContact"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "EmailContact_workspaceId_consentStatus_segment_idx" ON "EmailContact"("workspaceId", "consentStatus", "segment");

-- CreateIndex
CREATE UNIQUE INDEX "EmailContact_workspaceId_email_key" ON "EmailContact"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_workspaceId_name_key" ON "EmailTemplate"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "EmailCampaign_workspaceId_status_idx" ON "EmailCampaign"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "EmailDeliveryEvent_workspaceId_campaignId_status_idx" ON "EmailDeliveryEvent"("workspaceId", "campaignId", "status");

-- CreateIndex
CREATE INDEX "EmailDeliveryEvent_email_idx" ON "EmailDeliveryEvent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceCompliancePolicy_workspaceId_key" ON "VoiceCompliancePolicy"("workspaceId");

-- CreateIndex
CREATE INDEX "VoiceConsentRecord_workspaceId_consentStatus_idx" ON "VoiceConsentRecord"("workspaceId", "consentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceConsentRecord_workspaceId_phoneE164_key" ON "VoiceConsentRecord"("workspaceId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceAgentProfile_workspaceId_name_key" ON "VoiceAgentProfile"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "VoiceCallSession_workspaceId_status_idx" ON "VoiceCallSession"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "VoiceCallSession_phoneE164_idx" ON "VoiceCallSession"("phoneE164");

-- CreateIndex
CREATE INDEX "FactoryAutomationWorkflow_workspaceId_status_idx" ON "FactoryAutomationWorkflow"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryAutomationWorkflow_workspaceId_name_key" ON "FactoryAutomationWorkflow"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryAutomationRun_idempotencyKey_key" ON "FactoryAutomationRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FactoryAutomationRun_workspaceId_workflowId_status_idx" ON "FactoryAutomationRun"("workspaceId", "workflowId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryCrmOrganization_workspaceId_name_key" ON "FactoryCrmOrganization"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "FactoryCrmContact_workspaceId_assignedTo_idx" ON "FactoryCrmContact"("workspaceId", "assignedTo");

-- CreateIndex
CREATE INDEX "FactoryCrmContact_email_idx" ON "FactoryCrmContact"("email");

-- CreateIndex
CREATE INDEX "FactoryCrmOpportunity_workspaceId_pipeline_stage_idx" ON "FactoryCrmOpportunity"("workspaceId", "pipeline", "stage");

-- CreateIndex
CREATE INDEX "FactoryCrmOpportunity_workspaceId_status_idx" ON "FactoryCrmOpportunity"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FactoryCrmActivity_workspaceId_createdAt_idx" ON "FactoryCrmActivity"("workspaceId", "createdAt");

