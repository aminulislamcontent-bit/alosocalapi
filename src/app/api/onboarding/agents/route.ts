import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { AGENT_TEAM_DEFINITIONS, runAgentExecution, type AgentCode } from '@/lib/onboarding/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const tenantId = req.nextUrl.searchParams.get('tenantId') || undefined;
  const runs = await db.agentExecutionRun.findMany({
    where: tenantId ? { clientId: tenantId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 60,
  });

  return NextResponse.json({ agents: AGENT_TEAM_DEFINITIONS, runs });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const agentCode = String(body.agentCode || '').toUpperCase() as AgentCode;
  const action = String(body.action || '').trim();
  const tenantId = String(body.tenantId || '').trim();
  if (!['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(agentCode) || !action || !tenantId) {
    return NextResponse.json({ error: 'agentCode (A-H), action, and tenantId are required.' }, { status: 400 });
  }

  try {
    const res = await runAgentExecution({
      agentCode,
      action,
      tenantId,
      providerKey: body.providerKey ? String(body.providerKey) : undefined,
      ownerEmail: body.ownerEmail ? String(body.ownerEmail) : undefined,
      payload: body.payload && typeof body.payload === 'object' ? (body.payload as Record<string, unknown>) : undefined,
      actor: guard.user.username,
    });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Agent execution denied.' }, { status: 400 });
  }
}
