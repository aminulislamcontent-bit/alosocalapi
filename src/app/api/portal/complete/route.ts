import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { computeProgress } from '@/lib/platforms';

/** POST /api/portal/complete — finish collection, lock account, auto-logout */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'client' || !user.clientId) {
    return NextResponse.json({ error: 'লগইন প্রয়োজন।' }, { status: 401 });
  }

  const client = await db.clientAccount.findUnique({
    where: { id: user.clientId },
    include: { entries: true },
  });
  if (!client) return NextResponse.json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });
  if (client.status !== 'active') {
    return NextResponse.json({ error: 'সংগ্রহ ইতিমধ্যে সম্পন্ন।' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const platforms = JSON.parse(client.platforms) as string[];
  const progress = computeProgress(platforms, client.entries);

  if (!body.force && progress.pending > 0) {
    return NextResponse.json(
      { error: `এখনও ${progress.pending}টি ফিল্ড বাকি আছে। সব দিন অথবা "নেই" চেপে স্কিপ করুন।`, pending: progress.pending },
      { status: 409 }
    );
  }

  await db.clientAccount.update({
    where: { id: client.id },
    data: { status: 'completed', completedAt: new Date() },
  });
  await db.portalSession.deleteMany({ where: { clientId: client.id } });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  await db.activityLog.create({
    data: {
      clientId: client.id,
      actor: 'client',
      action: 'collection_completed',
      detail: `Collection finished — ${progress.collected} fields collected, ${progress.skipped} skipped. Account auto-locked.`,
      ip,
    },
  });

  return NextResponse.json({
    ok: true,
    summary: { collected: progress.collected, skipped: progress.skipped, total: progress.total },
  });
}
