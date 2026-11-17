import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { enqueueFactoryJob, processDueFactoryJobs, retryDeadLetterFactoryJob } from '@/lib/factory/job-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const jobs = await db.factoryJob.findMany({
    where: { workspaceId: access.workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ workspaceId: access.workspaceId, jobs });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: 'execute',
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  const action = String(body.action || 'enqueue');
  try {
    if (action === 'enqueue') {
      const res = await enqueueFactoryJob({
        workspaceId: access.workspaceId,
        moduleKey: String(body.moduleKey || 'marketing_automation'),
        jobType: String(body.jobType || 'generic.task'),
        payload: body.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : {},
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
        maxAttempts: typeof body.maxAttempts === 'number' ? body.maxAttempts : undefined,
        actor: access.user.username,
      });
      return NextResponse.json(res);
    }

    if (action === 'run_due') {
      const out = await processDueFactoryJobs({
        workspaceId: access.workspaceId,
        limit: typeof body.limit === 'number' ? body.limit : 10,
        actor: access.user.username,
      });
      return NextResponse.json(out);
    }

    if (action === 'retry_dlq') {
      const jobId = String(body.jobId || '');
      if (!jobId) return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });
      const out = await retryDeadLetterFactoryJob(access.workspaceId, jobId, access.user.username);
      return NextResponse.json(out);
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Job queue operation failed.' }, { status: 400 });
  }
}
