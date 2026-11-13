import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { runTargetedDiscovery } from '@/lib/engine/runner';

// ─── Targeted discovery runs (Mode B) ───────────────────────────────

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get('clientId');
  const scope = await requireEngineScope(requested);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ runs: [] });

  const runs = await db.discoveryRun.findMany({
    where: { clientId },
    orderBy: { startedAt: 'desc' },
    take: 30,
  });
  return NextResponse.json({
    runs: runs.map(r => ({
      id: r.id,
      campaignId: r.campaignId,
      mode: r.mode,
      status: r.status,
      stats: JSON.parse(r.stats || '{}'),
      logs: JSON.parse(r.logs || '[]'),
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    campaignId?: string;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  if (!body.campaignId) {
    return NextResponse.json({ error: 'campaignId আবশ্যক।' }, { status: 400 });
  }
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট নির্বাচন করুন।' }, { status: 400 });

  const campaign = await db.acquisitionCampaign.findUnique({ where: { id: body.campaignId } });
  if (!campaign || campaign.clientId !== clientId) {
    return NextResponse.json({ error: 'ক্যাম্পেইন এই টেন্যান্টের নয়।' }, { status: 403 });
  }
  if (campaign.status === 'paused' || campaign.status === 'completed') {
    return NextResponse.json({ error: `ক্যাম্পেইন ${campaign.status} অবস্থায় আছে।` }, { status: 400 });
  }
  if (!campaign.profileId) {
    return NextResponse.json({ error: 'ক্যাম্পেইনে টার্গেটিং প্রোফাইল যুক্ত করুন।' }, { status: 400 });
  }

  // Verify campaign budget only allows free sources right now (§13):
  // paid providers require a real integration + approved paid_usage request.
  const paidPending = await db.approvalRequest.findFirst({
    where: { clientId, type: 'paid_usage', status: 'pending' },
  });
  if (paidPending && campaign.budgetPreference === 'paid_with_approval') {
    return NextResponse.json(
      { error: 'paid_usage অনুমোদন এখনো pending — ফ্রি সোর্সে চালান বা অনুমোদনের অপেক্ষা করুন।', approvalId: paidPending.id },
      { status: 403 },
    );
  }

  const result = await runTargetedDiscovery({
    clientId,
    campaignId: body.campaignId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
