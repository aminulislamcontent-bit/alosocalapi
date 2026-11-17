import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { runPostLoginInitialization } from '@/lib/onboarding/initialization';
import { runSafeIntegrityRepair, runSystemIntegrityCheck } from '@/lib/onboarding/integrity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const [initRuns, integrityRecords] = await Promise.all([
    db.systemInitializationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 15 }),
    db.systemIntegrityRecord.findMany({ orderBy: { checkedAt: 'desc' }, take: 50 }),
  ]);

  return NextResponse.json({ initRuns, integrityRecords });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action || 'initialize');

  if (action === 'initialize') {
    const init = await runPostLoginInitialization(guard.user.username);
    return NextResponse.json({ init });
  }

  if (action === 'integrity_check') {
    const report = await runSystemIntegrityCheck(guard.user.username);
    return NextResponse.json({ report });
  }

  if (action === 'safe_repair') {
    const targets = Array.isArray(body?.targets) ? body.targets.map(String) : [];
    if (!targets.length) {
      return NextResponse.json({ error: 'Provide non-empty targets array for deterministic repair.' }, { status: 400 });
    }
    const repairs = await runSafeIntegrityRepair({ targets, actor: guard.user.username });
    return NextResponse.json({ repairs });
  }

  return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
}
