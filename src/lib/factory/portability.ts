import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';

/**
 * Secret-free portable backup and restore for First-Party Platform Factory workspaces.
 * Vault ciphertexts and plaintext credentials are strictly excluded from portable snapshots.
 */
export async function buildFactoryWorkspaceSnapshot(workspaceId: string, actor: string) {
  const workspace = await db.factoryWorkspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new Error('Workspace not found.');

  const [
    members,
    moduleConfigs,
    moduleRecords,
    emailDomains,
    emailTemplates,
    voicePolicy,
    voiceAgents,
    workflows,
    crmOrgs,
    crmContacts,
    crmOpportunities,
    providerConnections,
  ] = await Promise.all([
    db.factoryWorkspaceMember.findMany({ where: { workspaceId } }),
    db.factoryModuleConfig.findMany({ where: { workspaceId } }),
    db.factoryModuleRecord.findMany({ where: { workspaceId }, take: 500 }),
    db.emailSendingDomain.findMany({ where: { workspaceId } }),
    db.emailTemplate.findMany({ where: { workspaceId } }),
    db.voiceCompliancePolicy.findUnique({ where: { workspaceId } }),
    db.voiceAgentProfile.findMany({ where: { workspaceId } }),
    db.factoryAutomationWorkflow.findMany({ where: { workspaceId } }),
    db.factoryCrmOrganization.findMany({ where: { workspaceId } }),
    db.factoryCrmContact.findMany({ where: { workspaceId } }),
    db.factoryCrmOpportunity.findMany({ where: { workspaceId } }),
    db.factoryProviderConnection.findMany({ where: { workspaceId } }),
  ]);

  const payload = {
    schemaVersion: 'aloapi-factory-backup-v1',
    exportedAt: new Date().toISOString(),
    exportedBy: actor,
    secretsIncluded: false,
    workspace,
    members,
    moduleConfigs,
    moduleRecords,
    email: { domains: emailDomains, templates: emailTemplates },
    voice: { policy: voicePolicy, agents: voiceAgents },
    automation: { workflows },
    crm: { organizations: crmOrgs, contacts: crmContacts, opportunities: crmOpportunities },
    providerConnections: providerConnections.map(c => ({
      moduleKey: c.moduleKey,
      providerKey: c.providerKey,
      status: c.status,
      scopes: c.scopes,
      approvedBy: c.approvedBy,
      approvedAt: c.approvedAt,
    })),
  };

  const json = JSON.stringify(payload, null, 2);
  const sha256 = crypto.createHash('sha256').update(json).digest('hex');

  await auditEvent({
    actor,
    action: 'factory.portability.export',
    target: workspaceId,
    metadata: { sha256, bytes: json.length, secretsIncluded: false },
  });

  return { sha256, snapshot: payload };
}

export async function restoreFactoryWorkspaceModuleConfigs(params: {
  workspaceId: string;
  snapshot: Record<string, unknown>;
  expectedSha256?: string;
  actor: string;
}) {
  if (params.snapshot.schemaVersion !== 'aloapi-factory-backup-v1') {
    throw new Error('Unsupported backup schema version.');
  }
  if (params.snapshot.secretsIncluded !== false) {
    throw new Error('Backup rejected: secretsIncluded flag must be false.');
  }

  const rawConfigs = Array.isArray(params.snapshot.moduleConfigs)
    ? (params.snapshot.moduleConfigs as { moduleKey: string; enabled?: boolean; adapterMode?: string; config?: string }[])
    : [];

  let restoredConfigs = 0;
  for (const cfg of rawConfigs) {
    if (!cfg || typeof cfg.moduleKey !== 'string') continue;
    await db.factoryModuleConfig.upsert({
      where: { workspaceId_moduleKey: { workspaceId: params.workspaceId, moduleKey: cfg.moduleKey } },
      update: {
        enabled: cfg.enabled ?? true,
        adapterMode: cfg.adapterMode ?? 'local',
        config: typeof cfg.config === 'string' ? cfg.config : '{}',
        updatedBy: params.actor,
      },
      create: {
        workspaceId: params.workspaceId,
        moduleKey: cfg.moduleKey,
        enabled: cfg.enabled ?? true,
        adapterMode: cfg.adapterMode ?? 'local',
        config: typeof cfg.config === 'string' ? cfg.config : '{}',
        operationalStatus: 'READY',
        updatedBy: params.actor,
      },
    });
    restoredConfigs += 1;
  }

  await auditEvent({
    actor: params.actor,
    action: 'factory.portability.restore',
    target: params.workspaceId,
    metadata: { restoredConfigs },
  });

  return { restoredConfigs };
}
