import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';
import { dispatchEmailCampaign } from './modules/email-marketing';
import { recoverFailedAutomationRun } from './modules/automation-builder';

export async function enqueueFactoryJob(params: {
  workspaceId: string;
  moduleKey: string;
  jobType: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  scheduledFor?: Date;
  maxAttempts?: number;
  actor: string;
}) {
  const key = params.idempotencyKey?.trim() || `job-${crypto.randomUUID()}`;
  const existing = await db.factoryJob.findUnique({ where: { idempotencyKey: key } });
  if (existing) return { job: existing, deduplicated: true };

  const job = await db.factoryJob.create({
    data: {
      workspaceId: params.workspaceId,
      moduleKey: params.moduleKey,
      jobType: params.jobType,
      idempotencyKey: key,
      payload: JSON.stringify(params.payload ?? {}),
      status: 'queued',
      maxAttempts: params.maxAttempts ?? 3,
      scheduledFor: params.scheduledFor ?? new Date(),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.job.enqueue',
    target: `${params.workspaceId}:${job.id}`,
    metadata: { moduleKey: job.moduleKey, jobType: job.jobType },
  });

  return { job, deduplicated: false };
}

export async function processDueFactoryJobs(params: {
  workspaceId: string;
  limit?: number;
  actor: string;
}) {
  const now = new Date();
  const due = await db.factoryJob.findMany({
    where: {
      workspaceId: params.workspaceId,
      status: { in: ['queued', 'retrying'] },
      scheduledFor: { lte: now },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: { scheduledFor: 'asc' },
    take: Math.min(25, params.limit ?? 10),
  });

  const results: { jobId: string; status: string; detail: string }[] = [];

  for (const job of due) {
    await db.factoryJob.update({
      where: { id: job.id },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const payload = JSON.parse(job.payload) as Record<string, unknown>;
      let outcome: unknown = { ok: true, jobType: job.jobType };

      if (payload.simulateFailure) {
        throw new Error('Simulated worker failure for queue retry/DLQ test.');
      }

      if (job.jobType === 'email.campaign.dispatch' && typeof payload.campaignId === 'string') {
        outcome = await dispatchEmailCampaign({
          workspaceId: job.workspaceId,
          campaignId: payload.campaignId,
          actor: params.actor,
        });
      } else if (job.jobType === 'automation.workflow.retry' && typeof payload.runId === 'string') {
        outcome = await recoverFailedAutomationRun({
          workspaceId: job.workspaceId,
          runId: payload.runId,
          markRecovered: Boolean(payload.markRecovered),
          actor: params.actor,
        });
      }

      await db.factoryJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          result: JSON.stringify(outcome),
          lastError: null,
        },
      });
      results.push({ jobId: job.id, status: 'completed', detail: `Completed ${job.jobType}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Job execution error';
      const nextAttempts = job.attempts + 1;
      const deadLetter = nextAttempts >= job.maxAttempts;
      await db.factoryJob.update({
        where: { id: job.id },
        data: {
          status: deadLetter ? 'dead_letter' : 'retrying',
          attempts: nextAttempts,
          nextRetryAt: deadLetter ? null : new Date(Date.now() + 10_000 * nextAttempts),
          lastError: msg,
        },
      });
      results.push({ jobId: job.id, status: deadLetter ? 'dead_letter' : 'retrying', detail: msg });
    }
  }

  return { processedCount: results.length, results };
}

export async function retryDeadLetterFactoryJob(workspaceId: string, jobId: string, actor: string) {
  const job = await db.factoryJob.findFirst({ where: { id: jobId, workspaceId } });
  if (!job) throw new Error('Job not found.');
  await db.factoryJob.update({
    where: { id: job.id },
    data: {
      status: 'queued',
      attempts: 0,
      nextRetryAt: null,
      lastError: null,
      payload: JSON.stringify({ ...JSON.parse(job.payload), simulateFailure: false }),
    },
  });
  return processDueFactoryJobs({ workspaceId, limit: 1, actor });
}
