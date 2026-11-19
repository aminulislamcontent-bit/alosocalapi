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
  if (!Number.isInteger(params.maxAttempts ?? 3) || (params.maxAttempts ?? 3) < 1 || (params.maxAttempts ?? 3) > 20) throw new Error('Invalid retry budget.');
  let job;
  try {
    job = await db.factoryJob.create({ data:{workspaceId:params.workspaceId,moduleKey:params.moduleKey,jobType:params.jobType,idempotencyKey:key,payload:JSON.stringify(params.payload ?? {}),maxAttempts:params.maxAttempts ?? 3,scheduledFor:params.scheduledFor ?? new Date()} });
  } catch (err) {
    if ((err as {code?:string}).code !== 'P2002') throw err;
    job = await db.factoryJob.findUniqueOrThrow({where:{workspaceId_idempotencyKey:{workspaceId:params.workspaceId,idempotencyKey:key}}});
    return {job,deduplicated:true};
  }
  await auditEvent({
    actor: params.actor,
    action: 'factory.job.enqueue',
    target: `${params.workspaceId}:${job.id}`,
    metadata: { moduleKey: job.moduleKey, jobType: job.jobType },
  });

  return { job, deduplicated: false };
}

const LEASE_MS = 60_000;
function dueAt(now:Date) {
  return { OR:[{status:{in:['queued','retrying']},scheduledFor:{lte:now},OR:[{nextRetryAt:null},{nextRetryAt:{lte:now}}]},
    {status:'running', OR:[{leaseExpiresAt:{lte:now}},{leaseExpiresAt:null}]}] };
}
export async function processDueFactoryJobs(params:{workspaceId:string;limit?:number;actor:string;jobId?:string}) {
  const scope = {workspaceId:params.workspaceId,id:params.jobId};
  const due = await db.factoryJob.findMany({where:{...scope,...dueAt(new Date())},orderBy:{scheduledFor:'asc'},take:Math.max(1,Math.min(25,params.limit ?? 10))});
  const results: {jobId:string;status:string}[] = [];
  for (const job of due) {
    const now = new Date(), owner = crypto.randomUUID();
    const where = {workspaceId:params.workspaceId,id:job.id,attempts:job.attempts,...dueAt(now)};
    if (job.attempts >= job.maxAttempts) {
      await db.factoryJob.updateMany({where,data:{status:'dead_letter',lastError:'Retry budget exhausted',lockedBy:null,leaseExpiresAt:null}});
      continue;
    }
    const claim = await db.factoryJob.updateMany({where,data:{status:'running',startedAt:now,lockedBy:owner,lastHeartbeatAt:now,leaseExpiresAt:new Date(+now+LEASE_MS),attempts:{increment:1}}});
    if (!claim.count) continue;
    const owned = () => ({id:job.id,workspaceId:job.workspaceId,lockedBy:owner,status:'running',leaseExpiresAt:{gt:new Date()}});
    const pulse = setInterval(()=>{void db.factoryJob.updateMany({where:owned(),data:{lastHeartbeatAt:new Date(),leaseExpiresAt:new Date(Date.now()+LEASE_MS)}}).catch(()=>{});},LEASE_MS/3);
    try {
      await auditEvent({actor:params.actor || 'worker',action:job.status==='running'?'factory.job.recover':'factory.job.claim',target:job.id,metadata:{owner,attempt:job.attempts+1}});
      const payload = JSON.parse(job.payload);
      let result;
      if (job.jobType==='email.campaign.dispatch' && typeof payload.campaignId==='string') {
        result = await dispatchEmailCampaign({workspaceId:job.workspaceId,campaignId:payload.campaignId,actor:params.actor});
      } else if (job.jobType==='automation.workflow.retry' && typeof payload.runId==='string') {
        result = await recoverFailedAutomationRun({workspaceId:job.workspaceId,runId:payload.runId,markRecovered:Boolean(payload.markRecovered),actor:params.actor});
      } else throw new Error('No configured handler for job.');
      const done = await db.factoryJob.updateMany({where:owned(),data:{status:'completed',completedAt:new Date(),result:JSON.stringify(result),lockedBy:null,leaseExpiresAt:null,lastError:null}});
      if (done.count) results.push({jobId:job.id,status:'completed'});
    } catch {
      const status = job.attempts+1 >= job.maxAttempts ? 'dead_letter':'retrying';
      const done = await db.factoryJob.updateMany({where:owned(),data:{status,lastError:'Job handler failed',nextRetryAt:new Date(Date.now()+10000*(job.attempts+1)),lockedBy:null,leaseExpiresAt:null}});
      if(done.count) results.push({jobId:job.id,status});
    } finally {clearInterval(pulse);}
  }
  return {processedCount:results.length,results};
}
export async function retryDeadLetterFactoryJob(workspaceId:string,jobId:string,actor:string) {
  // Explicit administrative intervention grants one additional attempt, never resets history.
  const claim = await db.factoryJob.updateMany({where:{workspaceId,id:jobId,status:'dead_letter',maxAttempts:{lt:20}},data:{status:'queued',maxAttempts:{increment:1},scheduledFor:new Date(),nextRetryAt:null}});
  if (!claim.count) throw new Error('Job is not eligible for manual retry.');
  return processDueFactoryJobs({workspaceId,jobId,actor});
}
