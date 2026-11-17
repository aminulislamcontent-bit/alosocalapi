import { db } from '@/lib/db';

export const PLAN_LIMITS: Record<
  string,
  { monthlyEmailQuota: number; monthlyVoiceMinutesQuota: number; monthlyAiTokensQuota: number; monthlyJobsQuota: number }
> = {
  free: { monthlyEmailQuota: 500, monthlyVoiceMinutesQuota: 30, monthlyAiTokensQuota: 50_000, monthlyJobsQuota: 250 },
  growth: { monthlyEmailQuota: 25_000, monthlyVoiceMinutesQuota: 1_000, monthlyAiTokensQuota: 1_000_000, monthlyJobsQuota: 10_000 },
  pro: { monthlyEmailQuota: 100_000, monthlyVoiceMinutesQuota: 5_000, monthlyAiTokensQuota: 5_000_000, monthlyJobsQuota: 50_000 },
  enterprise: { monthlyEmailQuota: 1_000_000, monthlyVoiceMinutesQuota: 50_000, monthlyAiTokensQuota: 50_000_000, monthlyJobsQuota: 500_000 },
};

export async function recordFactoryUsage(params: {
  workspaceId: string;
  moduleKey: string;
  metric: string;
  quantity: number;
  unitCostUsd?: number;
  adapter?: string;
  metadata?: Record<string, unknown>;
}) {
  const unitCost = params.unitCostUsd ?? 0;
  const totalCostUsd = Number((params.quantity * unitCost).toFixed(6));

  return db.factoryUsageEvent.create({
    data: {
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      metric: params.metric,
      quantity: params.quantity,
      unitCostUsd: unitCost,
      totalCostUsd,
      adapter: params.adapter || 'local',
      metadata: JSON.stringify(params.metadata ?? {}),
    },
  });
}

export async function getWorkspaceUsageSummary(workspaceId: string) {
  const workspace = await db.factoryWorkspace.findUnique({ where: { id: workspaceId } });
  const planTier = workspace?.planTier || 'growth';
  const limits = PLAN_LIMITS[planTier] || PLAN_LIMITS.growth;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const events = await db.factoryUsageEvent.findMany({
    where: { workspaceId, createdAt: { gte: monthStart } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });

  const byModule: Record<string, { events: number; totalCostUsd: number; metrics: Record<string, number> }> = {};
  let totalCostUsd = 0;
  let emailSentThisMonth = 0;
  let voiceMinutesThisMonth = 0;
  let aiTokensThisMonth = 0;

  for (const ev of events) {
    totalCostUsd += ev.totalCostUsd;
    if (!byModule[ev.moduleKey]) {
      byModule[ev.moduleKey] = { events: 0, totalCostUsd: 0, metrics: {} };
    }
    byModule[ev.moduleKey].events += 1;
    byModule[ev.moduleKey].totalCostUsd = Number((byModule[ev.moduleKey].totalCostUsd + ev.totalCostUsd).toFixed(6));
    byModule[ev.moduleKey].metrics[ev.metric] = (byModule[ev.moduleKey].metrics[ev.metric] ?? 0) + ev.quantity;

    if (ev.metric === 'email_sent') emailSentThisMonth += ev.quantity;
    if (ev.metric === 'voice_minute') voiceMinutesThisMonth += ev.quantity;
    if (ev.metric === 'ai_tokens') aiTokensThisMonth += ev.quantity;
  }

  return {
    workspaceId,
    planTier,
    billingPeriod: monthStart.toISOString().slice(0, 7),
    limits,
    usage: {
      emailSentThisMonth,
      voiceMinutesThisMonth,
      aiTokensThisMonth,
      totalEvents: events.length,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
    },
    byModule,
  };
}
