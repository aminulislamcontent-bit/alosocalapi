import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { summarizeCatalog } from '@/lib/intelligence/catalog';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { FIRST_PARTY_MODULES } from '@/lib/factory/modules/registry';
import { getWorkspaceUsageSummary } from '@/lib/factory/billing';
import { listFactoryProviderConnections } from '@/lib/factory/provider-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requestedWs = req.nextUrl.searchParams.get('workspaceId');
  const access = await requireFactoryAccess(req, { workspaceId: requestedWs, permission: 'read' });
  if (!access.ok) return access.response;

  const wid = access.workspaceId;
  const [
    workspaces,
    members,
    moduleConfigs,
    recordGroups,
    connections,
    jobs,
    usageSummary,
    emailDomains,
    emailCampaigns,
    voicePolicy,
    voiceCalls,
    workflows,
    workflowRuns,
    crmOpportunities,
    auditEvents,
  ] = await Promise.all([
    db.factoryWorkspace.findMany({ orderBy: { createdAt: 'asc' } }),
    db.factoryWorkspaceMember.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'asc' } }),
    db.factoryModuleConfig.findMany({ where: { workspaceId: wid } }),
    db.factoryModuleRecord.groupBy({ by: ['moduleKey'], where: { workspaceId: wid }, _count: { _all: true } }),
    listFactoryProviderConnections(wid),
    db.factoryJob.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 50 }),
    getWorkspaceUsageSummary(wid),
    db.emailSendingDomain.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' } }),
    db.emailCampaign.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.voiceCompliancePolicy.findUnique({ where: { workspaceId: wid } }),
    db.voiceCallSession.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.factoryAutomationWorkflow.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: 'desc' } }),
    db.factoryAutomationRun.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.factoryCrmOpportunity.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: 'desc' }, take: 50 }),
    db.integrationAuditEvent.findMany({
      where: { action: { startsWith: 'factory.' } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
  ]);

  const countMap = Object.fromEntries(recordGroups.map(g => [g.moduleKey, g._count._all]));
  const configMap = new Map(moduleConfigs.map(c => [c.moduleKey, c]));

  const modules = FIRST_PARTY_MODULES.map(mod => {
    const cfg = configMap.get(mod.key);
    let itemCount = countMap[mod.key] ?? 0;
    if (mod.key === 'email_marketing') itemCount = emailCampaigns.length;
    if (mod.key === 'voice_call_center') itemCount = voiceCalls.length;
    if (mod.key === 'marketing_automation') itemCount = workflows.length;
    if (mod.key === 'ai_crm') itemCount = crmOpportunities.length;

    return {
      ...mod,
      enabled: cfg?.enabled ?? true,
      adapterMode: cfg?.adapterMode ?? 'local',
      operationalStatus: cfg?.operationalStatus ?? 'READY',
      itemCount,
      authorizedProvidersCount: connections.filter(c => c.moduleKey === mod.key && c.status === 'authorized_with_vault').length,
    };
  });

  return NextResponse.json({
    apiVersion: 'v1',
    activeWorkspaceId: wid,
    currentRole: access.role,
    externalCatalogSummary: summarizeCatalog(),
    workspaces,
    members,
    modules,
    connections,
    jobsSummary: {
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued' || j.status === 'retrying').length,
      deadLetter: jobs.filter(j => j.status === 'dead_letter').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      recent: jobs,
    },
    usageSummary,
    emailHealth: {
      domains: emailDomains,
      verifiedDomains: emailDomains.filter(d => d.verifiedForProduction).length,
      campaigns: emailCampaigns,
    },
    voiceHealth: {
      policy: voicePolicy,
      calls: voiceCalls,
      blockedCalls: voiceCalls.filter(c => c.status === 'blocked_compliance').length,
    },
    automationHealth: {
      workflows,
      runs: workflowRuns,
      awaitingApproval: workflowRuns.filter(r => r.status === 'awaiting_approval').length,
    },
    auditEvents,
  });
}
