import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  checkDuplicateAccountRisk,
  detectBrowserRuntimeCapability,
  startBrowserWorkflowSession,
  updateBrowserWorkflowSessionControl,
} from '@/lib/onboarding/browser-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;
  const sessions = await db.browserWorkflowSession.findMany({
    where: tenantId ? { clientId: tenantId } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 60,
  });

  return NextResponse.json({
    runtime: detectBrowserRuntimeCapability(),
    sessions,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'start');

  try {
    if (action === 'check_duplicate') {
      const tenantId = String(body.tenantId || '').trim();
      const providerKey = String(body.providerKey || '').trim();
      const ownerEmail = String(body.ownerEmail || '').trim();
      if (!tenantId || !providerKey) {
        return NextResponse.json({ error: 'tenantId and providerKey are required.' }, { status: 400 });
      }
      const check = await checkDuplicateAccountRisk(tenantId, providerKey, ownerEmail);
      return NextResponse.json({ check });
    }

    if (action === 'start') {
      const tenantId = String(body.tenantId || '').trim();
      const providerKey = String(body.providerKey || '').trim();
      const ownerEmail = String(body.ownerEmail || '').trim();
      const workflowType = (['account_setup', 'developer_portal', 'oauth_consent'].includes(String(body.workflowType))
        ? String(body.workflowType)
        : 'account_setup') as 'account_setup' | 'developer_portal' | 'oauth_consent';

      if (!tenantId || !providerKey) {
        return NextResponse.json({ error: 'tenantId and providerKey are required.' }, { status: 400 });
      }
      const res = await startBrowserWorkflowSession({
        tenantId,
        providerKey,
        workflowType,
        ownerEmail,
        targetUrl: body.targetUrl ? String(body.targetUrl) : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(res);
    }

    if (['pause', 'resume', 'cancel', 'approve_step', 'complete'].includes(action)) {
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
      const updated = await updateBrowserWorkflowSessionControl({
        sessionId,
        tenantId: body.tenantId ? String(body.tenantId) : undefined,
        control: action as 'pause' | 'resume' | 'cancel' | 'approve_step' | 'complete',
        note: body.note ? String(body.note) : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json({ session: updated });
    }

    return NextResponse.json({ error: `Unsupported control action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Browser workflow failed.' }, { status: 400 });
  }
}
