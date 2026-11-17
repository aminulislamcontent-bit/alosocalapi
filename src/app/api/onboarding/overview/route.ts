import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { CANONICAL_CATEGORIES, IMPLEMENTATION_LEVELS, summarizeCatalog } from '@/lib/intelligence/catalog';
import { AGENT_TEAM_DEFINITIONS } from '@/lib/onboarding/agents';
import { detectBrowserRuntimeCapability } from '@/lib/onboarding/browser-orchestrator';
import { getExpiringCredentials, listVaultCredentialsMetadata } from '@/lib/onboarding/vault-service';
import { ONBOARDING_STATES } from '@/lib/onboarding/state-machine';
import { vaultConfigured } from '@/lib/security/vault-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;

  const [
    catalogSummary,
    workflows,
    profiles,
    credentials,
    expiringCredentials,
    oauthStates,
    browserSessions,
    agentRuns,
    omniEvents,
    initRuns,
    integrityRecords,
    discoverySnapshots,
    auditLogs,
    clients,
  ] = await Promise.all([
    Promise.resolve(summarizeCatalog()),
    db.onboardingWorkflow.findMany({ where: tenantId ? { clientId: tenantId } : undefined, orderBy: { updatedAt: 'desc' }, take: 200 }),
    db.clientRequirementProfile.findMany({ where: tenantId ? { clientId: tenantId } : undefined, orderBy: { updatedAt: 'desc' }, take: 50 }),
    listVaultCredentialsMetadata(tenantId),
    getExpiringCredentials(14, tenantId),
    db.oAuthAuthorizationState.findMany({
      where: tenantId ? { clientId: tenantId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, clientId: true, providerKey: true, status: true, scopes: true, expiresAt: true, consumedAt: true, errorDetail: true, createdAt: true },
    }),
    db.browserWorkflowSession.findMany({ where: tenantId ? { clientId: tenantId } : undefined, orderBy: { updatedAt: 'desc' }, take: 50 }),
    db.agentExecutionRun.findMany({ where: tenantId ? { clientId: tenantId } : undefined, orderBy: { createdAt: 'desc' }, take: 60 }),
    db.omniEvent.findMany({ where: tenantId ? { clientId: tenantId } : undefined, orderBy: { createdAt: 'desc' }, take: 80 }),
    db.systemInitializationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    db.systemIntegrityRecord.findMany({ orderBy: { checkedAt: 'desc' }, take: 40 }),
    db.apiDiscoverySnapshot.findMany({ orderBy: { checkedAt: 'desc' }, take: 40 }),
    db.integrationAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    db.clientAccount.findMany({ select: { id: true, username: true, name: true, business: true, status: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    vaultReady: vaultConfigured(),
    browserCapability: detectBrowserRuntimeCapability(),
    catalogSummary,
    canonicalCategories: CANONICAL_CATEGORIES,
    implementationLevels: IMPLEMENTATION_LEVELS,
    onboardingStates: ONBOARDING_STATES,
    agents: AGENT_TEAM_DEFINITIONS,
    clients,
    workflows,
    profiles,
    credentials,
    expiringCredentials,
    oauthStates,
    browserSessions,
    agentRuns,
    omniEvents,
    initRuns,
    integrityRecords,
    discoverySnapshots,
    auditLogs,
    healthMetrics: {
      workflowsTotal: workflows.length,
      ownerActionPending: workflows.filter(w => Boolean(w.pendingCheckpoint) || w.state.startsWith('AWAITING_') || w.state === 'APP_REVIEW_REQUIRED').length,
      verifiedCount: workflows.filter(w => w.state === 'VERIFIED').length,
      blockedCount: workflows.filter(w => w.state === 'BLOCKED' || w.state === 'FAILED').length,
      vaultCredentialsCount: credentials.length,
      expiringCount: expiringCredentials.length,
      deadLetterEvents: omniEvents.filter(e => e.status === 'DEAD_LETTER').length,
      pendingApprovalSessions: browserSessions.filter(s => s.status === 'WAITING_FOR_OWNER').length,
    },
  });
}
