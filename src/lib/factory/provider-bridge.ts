import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { listVaultCredentialsMetadata } from '@/lib/onboarding/vault-service';
import { auditEvent } from '@/lib/security/audit';
import { getFirstPartyModule } from './modules/registry';

/**
 * Layer 2 (First-Party Platform Factory) <-> Layer 1 (External Provider Intelligence) bridge.
 * Enforces explicit tenant authorization; never silently connects external accounts.
 */
export async function connectExternalProviderToModule(params: {
  workspaceId: string;
  moduleKey: string;
  providerKey: string;
  scopes?: string[];
  configMeta?: Record<string, unknown>;
  approvedBy: string;
  explicitOwnerConsent: boolean;
  ip?: string;
}) {
  if (!params.explicitOwnerConsent) {
    throw new Error('Explicit tenant/owner consent is required before connecting an external provider.');
  }
  const mod = getFirstPartyModule(params.moduleKey);
  if (!mod) {
    throw new Error(`Unknown first-party module: ${params.moduleKey}`);
  }
  const provider = getProviderByKey(params.providerKey);
  if (!provider) {
    throw new Error(`External provider '${params.providerKey}' is not registered in the canonical external catalog.`);
  }

  const vaultEntries = await listVaultCredentialsMetadata(params.workspaceId, params.providerKey);
  const hasActiveSecret = vaultEntries.some(v => v.effectiveStatus === 'ACTIVE' || v.effectiveStatus === 'EXPIRING_SOON');

  const status = hasActiveSecret ? 'authorized_with_vault' : 'awaiting_vault_credentials';

  const connection = await db.factoryProviderConnection.upsert({
    where: {
      workspaceId_moduleKey_providerKey: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        providerKey: params.providerKey,
      },
    },
    update: {
      status,
      scopes: JSON.stringify(params.scopes ?? provider.requiredScopes ?? []),
      configMeta: JSON.stringify(params.configMeta ?? {}),
      approvedBy: params.approvedBy,
      approvedAt: new Date(),
      lastError: null,
    },
    create: {
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      providerKey: params.providerKey,
      status,
      scopes: JSON.stringify(params.scopes ?? provider.requiredScopes ?? []),
      configMeta: JSON.stringify(params.configMeta ?? {}),
      approvedBy: params.approvedBy,
      approvedAt: new Date(),
    },
  });

  await auditEvent({
    actor: params.approvedBy,
    action: 'factory.provider_bridge.connect',
    target: `${params.workspaceId}:${params.moduleKey}:${params.providerKey}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { status, hasActiveSecret },
  });

  return connection;
}

export async function disconnectExternalProviderFromModule(params: {
  workspaceId: string;
  moduleKey: string;
  providerKey: string;
  actor: string;
  ip?: string;
}) {
  const existing = await db.factoryProviderConnection.findUnique({
    where: {
      workspaceId_moduleKey_providerKey: {
        workspaceId: params.workspaceId,
        moduleKey: params.moduleKey,
        providerKey: params.providerKey,
      },
    },
  });
  if (!existing) throw new Error('Provider connection not found.');

  const updated = await db.factoryProviderConnection.update({
    where: { id: existing.id },
    data: { status: 'disconnected' },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.provider_bridge.disconnect',
    target: `${params.workspaceId}:${params.moduleKey}:${params.providerKey}`,
    providerKey: params.providerKey,
    ip: params.ip,
  });

  return updated;
}

export async function listFactoryProviderConnections(workspaceId: string, moduleKey?: string) {
  return db.factoryProviderConnection.findMany({
    where: {
      workspaceId,
      ...(moduleKey ? { moduleKey } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
  });
}
