-- CreateTable
CREATE TABLE "IntegrationProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL DEFAULT 'default-workspace',
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "businessProfileJson" TEXT NOT NULL DEFAULT '{}',
    "missingFieldsJson" TEXT NOT NULL DEFAULT '[]',
    "recommendedProvidersJson" TEXT NOT NULL DEFAULT '[]',
    "selectedProvidersJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'discovery',
    "defaultHandoverMode" TEXT NOT NULL DEFAULT 'CLIENT_ACCOUNT_REISSUANCE',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebsiteDiscoveryReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "fetchStatus" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "businessName" TEXT,
    "logoUrl" TEXT,
    "domainsJson" TEXT NOT NULL DEFAULT '[]',
    "emailsJson" TEXT NOT NULL DEFAULT '[]',
    "phonesJson" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT,
    "productsJson" TEXT NOT NULL DEFAULT '[]',
    "targetAudience" TEXT,
    "geographicMarkets" TEXT NOT NULL DEFAULT '[]',
    "socialProfilesJson" TEXT NOT NULL DEFAULT '[]',
    "detectedTechJson" TEXT NOT NULL DEFAULT '[]',
    "privacyPolicyUrl" TEXT,
    "termsUrl" TEXT,
    "missingFieldsJson" TEXT NOT NULL DEFAULT '[]',
    "contentHash" TEXT NOT NULL,
    "rawEvidenceJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteDiscoveryReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "IntegrationProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CredentialPreparationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "credentialType" TEXT NOT NULL,
    "applicationId" TEXT,
    "origin" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "associatedAccount" TEXT,
    "vaultCredentialId" TEXT,
    "envVarName" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "requiredPermissionsJson" TEXT NOT NULL DEFAULT '[]',
    "transferable" BOOLEAN NOT NULL DEFAULT false,
    "handoverMode" TEXT NOT NULL,
    "activationStatus" TEXT NOT NULL DEFAULT 'CLIENT_ACTIVATION_REQUIRED',
    "handoverRequirements" TEXT NOT NULL,
    "preparedMetadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CredentialPreparationRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "IntegrationProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthAppRegistryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "externalAppId" TEXT,
    "developerPortalUrl" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "redirectUrisJson" TEXT NOT NULL DEFAULT '[]',
    "callbackUrlsJson" TEXT NOT NULL DEFAULT '[]',
    "webhookUrl" TEXT,
    "webhookEventsJson" TEXT NOT NULL DEFAULT '[]',
    "webhookSignatureAlgorithm" TEXT NOT NULL DEFAULT 'hmac_sha256',
    "apiVersion" TEXT NOT NULL,
    "scopesJson" TEXT NOT NULL DEFAULT '[]',
    "dnsRecordsJson" TEXT NOT NULL DEFAULT '[]',
    "verificationStatus" TEXT NOT NULL DEFAULT 'CONFIGURED',
    "approvalChecklistJson" TEXT NOT NULL DEFAULT '[]',
    "configProfileJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OAuthAppRegistryEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "IntegrationProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "checkpointType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "officialPortalUrl" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "ownerInputMetaJson" TEXT NOT NULL DEFAULT '{}',
    "resumedWorkflowState" TEXT,
    "completedBy" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationCheckpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "IntegrationProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientHandoverPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "packageVersion" TEXT NOT NULL DEFAULT '1.0',
    "handoverMode" TEXT NOT NULL,
    "packageStatus" TEXT NOT NULL,
    "secretsIncluded" BOOLEAN NOT NULL DEFAULT false,
    "encryptedTransferApproved" BOOLEAN NOT NULL DEFAULT false,
    "sha256" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL DEFAULT '{}',
    "portabilityReportJson" TEXT NOT NULL DEFAULT '{}',
    "ownershipReportJson" TEXT NOT NULL DEFAULT '{}',
    "checklistJson" TEXT NOT NULL DEFAULT '[]',
    "clientImportManifestJson" TEXT NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "exportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientHandoverPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "IntegrationProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IntegrationProject_clientId_status_idx" ON "IntegrationProject"("clientId", "status");

-- CreateIndex
CREATE INDEX "IntegrationProject_domain_idx" ON "IntegrationProject"("domain");

-- CreateIndex
CREATE INDEX "WebsiteDiscoveryReport_projectId_createdAt_idx" ON "WebsiteDiscoveryReport"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CredentialPreparationRecord_projectId_providerKey_idx" ON "CredentialPreparationRecord"("projectId", "providerKey");

-- CreateIndex
CREATE INDEX "CredentialPreparationRecord_origin_activationStatus_idx" ON "CredentialPreparationRecord"("origin", "activationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialPreparationRecord_projectId_providerKey_credentialType_envVarName_key" ON "CredentialPreparationRecord"("projectId", "providerKey", "credentialType", "envVarName");

-- CreateIndex
CREATE INDEX "OAuthAppRegistryEntry_projectId_executionMode_idx" ON "OAuthAppRegistryEntry"("projectId", "executionMode");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAppRegistryEntry_projectId_providerKey_key" ON "OAuthAppRegistryEntry"("projectId", "providerKey");

-- CreateIndex
CREATE INDEX "VerificationCheckpoint_projectId_status_idx" ON "VerificationCheckpoint"("projectId", "status");

-- CreateIndex
CREATE INDEX "VerificationCheckpoint_providerKey_status_idx" ON "VerificationCheckpoint"("providerKey", "status");

-- CreateIndex
CREATE INDEX "ClientHandoverPackage_projectId_exportedAt_idx" ON "ClientHandoverPackage"("projectId", "exportedAt");

