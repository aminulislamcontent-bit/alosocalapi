ALTER TABLE "FactoryWorkspaceMember" ADD COLUMN "clientAccountId" TEXT;
ALTER TABLE "FactoryJob" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "FactoryJob" ADD COLUMN "leaseExpiresAt" DATETIME;
ALTER TABLE "FactoryJob" ADD COLUMN "lastHeartbeatAt" DATETIME;
ALTER TABLE "OAuthAuthorizationState" ADD COLUMN "initiator" TEXT;
ALTER TABLE "OAuthAuthorizationState" ADD COLUMN "tokenEndpoint" TEXT;
ALTER TABLE "EmailCampaign" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "EmailCampaign" ADD COLUMN "approvalDigest" TEXT;
ALTER TABLE "EmailDeliveryEvent" ADD COLUMN "submissionKey" TEXT;
CREATE UNIQUE INDEX "EmailDeliveryEvent_submissionKey_key" ON "EmailDeliveryEvent"("submissionKey");
CREATE UNIQUE INDEX "FactoryJob_workspaceId_idempotencyKey_key" ON "FactoryJob"("workspaceId", "idempotencyKey");
DROP INDEX "FactoryJob_idempotencyKey_key";
UPDATE "FactoryWorkspaceMember" SET "clientAccountId"=(SELECT id FROM ClientAccount WHERE ClientAccount.username=FactoryWorkspaceMember.username) WHERE NOT (workspaceId='default-workspace' AND role='owner') AND NOT EXISTS (SELECT 1 FROM AdminUser WHERE AdminUser.username=FactoryWorkspaceMember.username);
CREATE TABLE "OperationApproval" ("id" TEXT NOT NULL PRIMARY KEY, "tenantId" TEXT NOT NULL, "projectId" TEXT NOT NULL, "adminId" TEXT NOT NULL, "providerKey" TEXT NOT NULL, "action" TEXT NOT NULL, "digest" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL, "consumedAt" DATETIME);

-- These records represent externally submitted actions and are append-only.
CREATE TRIGGER executor_run_no_update BEFORE UPDATE ON AgentExecutionRun WHEN OLD.agentId='CLIENT_API_EXECUTOR' BEGIN SELECT RAISE(ABORT,'Execution records are immutable'); END;
CREATE TRIGGER executor_run_no_delete BEFORE DELETE ON AgentExecutionRun WHEN OLD.agentId='CLIENT_API_EXECUTOR' BEGIN SELECT RAISE(ABORT,'Execution records are immutable'); END;
