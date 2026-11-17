import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  completeCheckpointAndResumeWorkflow,
  generateRequiredCheckpointsForProvider,
} from '@/lib/engineering/verification-coordinator';
import { verifyProjectProviderDns } from '@/lib/engineering/dns-verifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const projectId = req.nextUrl.searchParams.get('projectId') || undefined;
  const checkpoints = await db.verificationCheckpoint.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ checkpoints });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'complete_and_resume');
  try {
    if (action === 'generate') {
      const checkpoints = await generateRequiredCheckpointsForProvider({
        projectId: String(body.projectId || ''),
        providerKey: String(body.providerKey || ''),
        actor: guard.user.username,
      });
      return NextResponse.json({ checkpoints });
    }

    if (action === 'verify_dns') {
      const report = await verifyProjectProviderDns({
        projectId: String(body.projectId || ''),
        providerKey: String(body.providerKey || ''),
        actor: guard.user.username,
      });
      return NextResponse.json(report);
    }

    if (action === 'complete_and_resume') {
      const res = await completeCheckpointAndResumeWorkflow({
        checkpointId: String(body.checkpointId || ''),
        ownerConfirmationNote: body.ownerConfirmationNote ? String(body.ownerConfirmationNote) : undefined,
        ownerInputMeta: body.ownerInputMeta && typeof body.ownerInputMeta === 'object'
          ? (body.ownerInputMeta as Record<string, unknown>)
          : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Checkpoint action failed.' }, { status: 400 });
  }
}
