import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { getFirstPartyModule } from '@/lib/factory/modules/registry';
import {
  decideAutomationApproval,
  recoverFailedAutomationRun,
  saveAutomationWorkflow,
  triggerAutomationWorkflow,
  type WorkflowEdge,
  type WorkflowNode,
} from '@/lib/factory/modules/automation-builder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const wid = access.workspaceId;
  const [workflows, runs] = await Promise.all([
    db.factoryAutomationWorkflow.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: 'desc' } }),
    db.factoryAutomationRun.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);

  return NextResponse.json({
    module: getFirstPartyModule('marketing_automation'),
    workspaceId: wid,
    workflows,
    runs,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || '');
  const perm = action === 'decide_approval' ? 'approve' : action === 'save_workflow' ? 'write' : 'execute';
  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: perm,
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  try {
    if (action === 'save_workflow') {
      const wf = await saveAutomationWorkflow({
        workspaceId: access.workspaceId,
        name: String(body.name || ''),
        triggerType: String(body.triggerType || 'manual'),
        nodes: Array.isArray(body.nodes) ? (body.nodes as WorkflowNode[]) : [],
        edges: Array.isArray(body.edges) ? (body.edges as WorkflowEdge[]) : [],
        status: body.status ? (String(body.status) as 'draft' | 'active' | 'paused') : 'active',
        requiresApproval: typeof body.requiresApproval === 'boolean' ? body.requiresApproval : undefined,
        maxAttempts: typeof body.maxAttempts === 'number' ? body.maxAttempts : 3,
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ workflow: wf }, { status: 201 });
    }

    if (action === 'trigger') {
      const out = await triggerAutomationWorkflow({
        workspaceId: access.workspaceId,
        workflowId: String(body.workflowId || ''),
        idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
        context: body.context && typeof body.context === 'object' ? (body.context as Record<string, unknown>) : {},
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json(out);
    }

    if (action === 'decide_approval') {
      const run = await decideAutomationApproval({
        workspaceId: access.workspaceId,
        runId: String(body.runId || ''),
        decision: body.decision === 'reject' ? 'reject' : 'approve',
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ run });
    }

    if (action === 'recover_run') {
      const run = await recoverFailedAutomationRun({
        workspaceId: access.workspaceId,
        runId: String(body.runId || ''),
        markRecovered: Boolean(body.markRecovered),
        actor: access.user.username,
      });
      return NextResponse.json({ run });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Automation operation failed.' }, { status: 400 });
  }
}
