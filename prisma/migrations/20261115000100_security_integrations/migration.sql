-- Additive ALOAPI security and Integration Intelligence tables. Existing CRM/Growth Engine rows remain untouched.
ALTER TABLE "AdminUser" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdminUser" ADD COLUMN "mfaSecretCiphertext" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "mfaPendingSecretCiphertext" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "mfaPendingSecretExpiresAt" DATETIME;
ALTER TABLE "AdminUser" ADD COLUMN "recoveryCodeHashes" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "PortalSession" ADD COLUMN "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "PortalSession_adminId_expiresAt_idx" ON "PortalSession"("adminId", "expiresAt");
CREATE INDEX "PortalSession_clientId_expiresAt_idx" ON "PortalSession"("clientId", "expiresAt");

CREATE TABLE "LoginThrottle" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" DATETIME,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "IntegrationProvider" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "category" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "verificationStatus" TEXT NOT NULL DEFAULT 'DISCOVERED',
  "lastCheckedAt" DATETIME,
  "lastCheck" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "IntegrationProvider_category_verificationStatus_idx" ON "IntegrationProvider"("category", "verificationStatus");

CREATE TABLE "IntegrationAccount" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerKey" TEXT NOT NULL,
  "businessName" TEXT,
  "accountIdentifier" TEXT,
  "phoneNumberCiphertext" TEXT,
  "verificationStatus" TEXT NOT NULL DEFAULT 'REQUIRES_USER_ACTION',
  "manualRequirements" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("providerKey") REFERENCES "IntegrationProvider"("key") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IntegrationAccount_providerKey_verificationStatus_idx" ON "IntegrationAccount"("providerKey", "verificationStatus");

CREATE TABLE "IntegrationSecret" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerKey" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("providerKey") REFERENCES "IntegrationProvider"("key") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("accountId") REFERENCES "IntegrationAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntegrationSecret_providerKey_accountId_name_key" ON "IntegrationSecret"("providerKey", "accountId", "name");
CREATE INDEX "IntegrationSecret_providerKey_accountId_idx" ON "IntegrationSecret"("providerKey", "accountId");

CREATE TABLE "IntegrationAuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "providerKey" TEXT,
  "accountId" TEXT,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IntegrationAuditEvent_providerKey_createdAt_idx" ON "IntegrationAuditEvent"("providerKey", "createdAt");
CREATE INDEX "IntegrationAuditEvent_action_createdAt_idx" ON "IntegrationAuditEvent"("action", "createdAt");

CREATE TABLE "IntegrationWebhookEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "providerKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("providerKey") REFERENCES "IntegrationProvider"("key") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IntegrationWebhookEvent_providerKey_createdAt_idx" ON "IntegrationWebhookEvent"("providerKey", "createdAt");
CREATE INDEX "IntegrationWebhookEvent_eventType_createdAt_idx" ON "IntegrationWebhookEvent"("eventType", "createdAt");

CREATE TABLE "IntegrationPrivacyPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  "retentionDays" INTEGER DEFAULT 365,
  "storeWebhookPayloads" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CredentialTransferKey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "privateKeyCiphertext" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CredentialTransferKey_expiresAt_idx" ON "CredentialTransferKey"("expiresAt");
