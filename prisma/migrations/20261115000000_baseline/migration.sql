-- Baseline schema for the repository state at 056dd3816d7abdd6938338b3e664f200baccfbfe.
-- This migration creates the pre-existing CRM/Growth Engine schema for new local databases.
-- Existing databases must be strictly verified and baselined before applying additive migrations.
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser" ("username");
CREATE TABLE "ClientAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "phone" TEXT,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "retentionDays" INTEGER,
  "platforms" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME
);
CREATE UNIQUE INDEX "ClientAccount_username_key" ON "ClientAccount" ("username");
CREATE TABLE "PortalSession" (
  "token" TEXT NOT NULL PRIMARY KEY,
  "role" TEXT NOT NULL,
  "adminId" TEXT,
  "clientId" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "CredentialEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "value" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "validationStatus" TEXT NOT NULL DEFAULT 'none',
  "validationNote" TEXT NOT NULL DEFAULT '',
  "validatedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CredentialEntry_clientId_platform_fieldKey_key" ON "CredentialEntry" ("clientId", "platform", "fieldKey");
CREATE TABLE "ActivityLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "ip" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Contact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'student',
  "grade" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "address" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Contact_name_idx" ON "Contact" ("name");
CREATE INDEX "Contact_phone_idx" ON "Contact" ("phone");
CREATE TABLE "Lead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'new',
  "value" INTEGER NOT NULL DEFAULT 0,
  "course" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Lead_stage_idx" ON "Lead" ("stage");
CREATE INDEX "Lead_contactId_idx" ON "Lead" ("contactId");
CREATE TABLE "CrmTask" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "dueAt" DATETIME,
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "contactId" TEXT,
  "leadId" TEXT,
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CrmTask_done_idx" ON "CrmTask" ("done");
CREATE INDEX "CrmTask_dueAt_idx" ON "CrmTask" ("dueAt");
CREATE TABLE "Interaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  "leadId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'note',
  "body" TEXT NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Interaction_contactId_idx" ON "Interaction" ("contactId");
CREATE INDEX "Interaction_createdAt_idx" ON "Interaction" ("createdAt");
CREATE TABLE "AutomationRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "condition" TEXT,
  "action" TEXT NOT NULL,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "builtIn" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AutomationRule_trigger_idx" ON "AutomationRule" ("trigger");
CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ruleId" TEXT NOT NULL,
  "leadId" TEXT,
  "contactId" TEXT,
  "detail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'success',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("ruleId") REFERENCES "AutomationRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AutomationRun_ruleId_idx" ON "AutomationRun" ("ruleId");
CREATE INDEX "AutomationRun_createdAt_idx" ON "AutomationRun" ("createdAt");
CREATE TABLE "KnowledgeEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "body" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "KnowledgeEntry_category_idx" ON "KnowledgeEntry" ("category");
CREATE TABLE "IndustryTaxonomy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL,
  "nameBn" TEXT NOT NULL,
  "parentSlug" TEXT,
  "level" INTEGER NOT NULL DEFAULT 1,
  "keywords" TEXT NOT NULL DEFAULT '[]',
  "custom" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "IndustryTaxonomy_slug_key" ON "IndustryTaxonomy" ("slug");
CREATE INDEX "IndustryTaxonomy_parentSlug_idx" ON "IndustryTaxonomy" ("parentSlug");
CREATE TABLE "GeoCountry" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "nameEn" TEXT NOT NULL,
  "nameBn" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "currency" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "GeoArea" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "countryCode" TEXT NOT NULL,
  "admin1" TEXT,
  "city" TEXT,
  "postal" TEXT,
  "lat" REAL,
  "lon" REAL,
  "custom" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GeoArea_countryCode_idx" ON "GeoArea" ("countryCode");
CREATE TABLE "ProviderRegistry" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "accessMethod" TEXT NOT NULL,
  "dataFields" TEXT NOT NULL DEFAULT '[]',
  "authRequired" BOOLEAN NOT NULL DEFAULT false,
  "freeTier" TEXT NOT NULL DEFAULT '{}',
  "paidTier" TEXT NOT NULL DEFAULT '{}',
  "rateLimit" TEXT NOT NULL DEFAULT '{}',
  "licensing" TEXT NOT NULL,
  "geoCoverage" TEXT NOT NULL DEFAULT 'global',
  "lastVerifiedAt" DATETIME,
  "integrationStatus" TEXT NOT NULL DEFAULT 'planned',
  "reliability" TEXT NOT NULL DEFAULT 'unknown',
  "notes" TEXT,
  "lastCheck" TEXT,
  "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "TargetingProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "industries" TEXT NOT NULL DEFAULT '[]',
  "countries" TEXT NOT NULL DEFAULT '[]',
  "areas" TEXT NOT NULL DEFAULT '[]',
  "audience" TEXT,
  "keywords" TEXT NOT NULL DEFAULT '[]',
  "intentSignals" TEXT NOT NULL DEFAULT '[]',
  "competitorRefs" TEXT NOT NULL DEFAULT '[]',
  "exclusions" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TargetingProfile_clientId_idx" ON "TargetingProfile" ("clientId");
CREATE TABLE "AcquisitionCampaign" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "profileId" TEXT,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'targeted',
  "objective" TEXT,
  "budgetPreference" TEXT NOT NULL DEFAULT 'free_first',
  "autonomy" TEXT NOT NULL DEFAULT 'approval_required',
  "sourceKeys" TEXT NOT NULL DEFAULT '[]',
  "qualificationCriteria" TEXT NOT NULL DEFAULT '{}',
  "exclusions" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "stats" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AcquisitionCampaign_clientId_status_idx" ON "AcquisitionCampaign" ("clientId", "status");
CREATE TABLE "DiscoveryRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "campaignId" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "params" TEXT NOT NULL DEFAULT '{}',
  "stats" TEXT NOT NULL DEFAULT '{}',
  "logs" TEXT NOT NULL DEFAULT '[]',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  FOREIGN KEY ("campaignId") REFERENCES "AcquisitionCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "DiscoveryRun_clientId_startedAt_idx" ON "DiscoveryRun" ("clientId", "startedAt");
CREATE TABLE "AcqLead" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "campaignId" TEXT,
  "runId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "website" TEXT,
  "category" TEXT,
  "countryCode" TEXT,
  "regionName" TEXT,
  "cityName" TEXT,
  "publicContactChannel" TEXT,
  "contactType" TEXT,
  "productsServices" TEXT,
  "description" TEXT,
  "sourceProviderKey" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "evidence" TEXT NOT NULL DEFAULT '[]',
  "usageRestrictions" TEXT,
  "confidence" REAL NOT NULL DEFAULT 0.5,
  "freshnessAt" DATETIME,
  "reviewStatus" TEXT NOT NULL DEFAULT 'unverified',
  "pipelineStatus" TEXT NOT NULL DEFAULT 'discovered',
  "score" REAL,
  "scoreBreakdown" TEXT,
  "intentSignals" TEXT NOT NULL DEFAULT '[]',
  "assignedTo" TEXT,
  "lawfulBasis" TEXT,
  "consentStatus" TEXT NOT NULL DEFAULT 'not_collected',
  "followUpAt" DATETIME,
  "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcqLead_clientId_fingerprint_key" ON "AcqLead" ("clientId", "fingerprint");
CREATE INDEX "AcqLead_clientId_pipelineStatus_idx" ON "AcqLead" ("clientId", "pipelineStatus");
CREATE INDEX "AcqLead_clientId_reviewStatus_idx" ON "AcqLead" ("clientId", "reviewStatus");
CREATE TABLE "AcqLeadActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "leadId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "data" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("leadId") REFERENCES "AcqLead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AcqLeadActivity_leadId_idx" ON "AcqLeadActivity" ("leadId");
CREATE TABLE "ApprovalRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT,
  "type" TEXT NOT NULL,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "justification" TEXT,
  "requestedBy" TEXT,
  "decidedBy" TEXT,
  "decidedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApprovalRequest_clientId_status_idx" ON "ApprovalRequest" ("clientId", "status");
CREATE TABLE "ProviderUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT,
  "providerKey" TEXT NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1,
  "unitType" TEXT NOT NULL DEFAULT 'requests',
  "windowStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ProviderUsage_providerKey_windowStart_idx" ON "ProviderUsage" ("providerKey", "windowStart");
CREATE TABLE "CostLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT,
  "providerKey" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 0,
  "estimatedUsd" REAL NOT NULL DEFAULT 0,
  "note" TEXT
);
CREATE UNIQUE INDEX "CostLedger_clientId_providerKey_period_key" ON "CostLedger" ("clientId", "providerKey", "period");
CREATE TABLE "ContactGovernance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'dnc',
  "reason" TEXT,
  "source" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContactGovernance_clientId_channel_identifier_key" ON "ContactGovernance" ("clientId", "channel", "identifier");
CREATE INDEX "ContactGovernance_clientId_status_idx" ON "ContactGovernance" ("clientId", "status");
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT,
  "actor" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "before" TEXT,
  "after" TEXT,
  "justification" TEXT,
  "ip" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_clientId_createdAt_idx" ON "AuditEvent" ("clientId", "createdAt");
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent" ("action");
CREATE TABLE "OpportunityReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT,
  "runId" TEXT,
  "scope" TEXT NOT NULL DEFAULT '{}',
  "findings" TEXT NOT NULL DEFAULT '[]',
  "sources" TEXT NOT NULL DEFAULT '[]',
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "WebsiteAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "psiData" TEXT NOT NULL DEFAULT '{}',
  "scores" TEXT NOT NULL DEFAULT '{}',
  "recommendations" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'completed',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WebsiteAudit_clientId_createdAt_idx" ON "WebsiteAudit" ("clientId", "createdAt");
CREATE TABLE "ContentItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "scheduledFor" DATETIME,
  "draft" TEXT NOT NULL,
  "hashtags" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'idea',
  "approvedBy" TEXT,
  "publishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("clientId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ContentItem_clientId_status_idx" ON "ContentItem" ("clientId", "status");
COMMIT;
PRAGMA foreign_keys=ON;
