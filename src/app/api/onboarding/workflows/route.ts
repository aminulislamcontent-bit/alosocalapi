import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  getAllowedNextStates,
  getOrCreateWorkflow,
  isValidOnboardingState,
  listWorkflows,
  ONBOARDING_STATES,
  transitionWorkflowState,
  type OnboardingState,
} from '@/lib/onboarding/state-machine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;
  const workflows = await listWorkflows(tenantId);
  return NextResponse.json({
    states: ONBOARDING_STATES,
    workflows: workflows.map(w => ({
      ...w,
      allowedNextStates: getAllowedNextStates(
        (isValidOnboardingState(w.state) ? w.state : 'NOT_STARTED') as OnboardingState,
      ),
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'init');
  if (action === 'init') {
    const tenantId = String(body.tenantId || '').trim();
    const providerKey = String(body.providerKey || '').trim();
    if (!tenantId || !providerKey) {
      return NextResponse.json({ error: 'tenantId and providerKey are required.' }, { status: 400 });
    }
    const wf = await getOrCreateWorkflow({ tenantId, providerKey });
    return NextResponse.json({ workflow: wf });
  }

  if (action === 'transition') {
    const workflowId = String(body.workflowId || '').trim();
    const nextStateRaw = String(body.nextState || '').trim();
    const reason = String(body.reason || 'Operator state transition').trim();
    if (!workflowId || !isValidOnboardingState(nextStateRaw)) {
      return NextResponse.json({ error: 'Valid workflowId and nextState are required.' }, { status: 400 });
    }
    try {
      const updated = await transitionWorkflowState({
        workflowId,
        nextState: nextStateRaw,
        actor: guard.user.username,
        reason,
        blockerReason: body.blockerReason ? String(body.blockerReason) : null,
        requiresOwnerApproval: Boolean(body.requiresOwnerApproval),
        approvalPrompt: body.approvalPrompt ? String(body.approvalPrompt) : null,
      });
      return NextResponse.json({ workflow: updated });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Transition failed.' }, { status: 400 });
    }
  }

  return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
}
