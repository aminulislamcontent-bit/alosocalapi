import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { writeAudit } from '@/lib/engine/audit';

// ─── Acquisition campaigns (§3 Mode B, §13 budget policy) ───────────

const VALID_BUDGET = ['free_only', 'free_first', 'paid_with_approval'];
const VALID_STATUS = ['draft', 'active', 'paused', 'completed'];
// §12 three-level autonomy (contact/paid/export stay approval-gated ALWAYS)
const VALID_AUTONOMY = ['suggest_only', 'approval_required', 'approved_automation'];

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get('clientId');
  const scope = await requireEngineScope(requested);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ campaigns: [] });

  const campaigns = await db.acquisitionCampaign.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({
    campaigns: campaigns.map(c => ({
      id: c.id,
      name: c.name,
      profileId: c.profileId,
      mode: c.mode,
      objective: c.objective,
      budgetPreference: c.budgetPreference,
      autonomy: c.autonomy,
      sourceKeys: JSON.parse(c.sourceKeys || '[]'),
      qualificationCriteria: JSON.parse(c.qualificationCriteria || '{}'),
      exclusions: JSON.parse(c.exclusions || '[]'),
      status: c.status,
      stats: JSON.parse(c.stats || '{}'),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requested = typeof body.clientId === 'string' ? body.clientId : null;
  const scope = await requireEngineScope(requested);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'clientId আবশ্যক (টেন্যান্ট নির্বাচন করুন)।' }, { status: 400 });

  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'ক্যাম্পেইনের নাম দিন।' }, { status: 400 });

  const budget = String(body.budgetPreference ?? 'free_first');
  if (!VALID_BUDGET.includes(budget)) {
    return NextResponse.json({ error: 'অপরিচিত বাজেট প্রেফারেন্স।' }, { status: 400 });
  }

  const autonomy = String(body.autonomy ?? 'approval_required');
  if (!VALID_AUTONOMY.includes(autonomy)) {
    return NextResponse.json({ error: 'autonomy হতে হবে: suggest_only | approval_required | approved_automation' }, { status: 400 });
  }

  if (body.profileId) {
    const profile = await db.targetingProfile.findUnique({ where: { id: String(body.profileId) } });
    if (!profile || profile.clientId !== clientId) {
      return NextResponse.json({ error: 'প্রোফাইল এই টেন্যান্টের নয়।' }, { status: 403 });
    }
  }

  const campaign = await db.acquisitionCampaign.create({
    data: {
      clientId,
      profileId: body.profileId ? String(body.profileId) : null,
      name,
      mode: String(body.mode ?? 'targeted'),
      objective: typeof body.objective === 'string' ? body.objective.trim() || null : null,
      budgetPreference: budget,
      autonomy,
      sourceKeys: JSON.stringify(Array.isArray(body.sourceKeys) ? body.sourceKeys : []),
      qualificationCriteria: JSON.stringify(
        typeof body.qualificationCriteria === 'object' && body.qualificationCriteria ? body.qualificationCriteria : { minScore: 55 },
      ),
      exclusions: JSON.stringify(Array.isArray(body.exclusions) ? body.exclusions : []),
      status: 'draft',
    },
  });

  await writeAudit({
    clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'campaign.create',
    resource: 'acquisition_campaign',
    resourceId: campaign.id,
    after: campaign,
  });
  return NextResponse.json({ ok: true, campaignId: campaign.id });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requested = typeof body.clientId === 'string' ? body.clientId : null;
  const scope = await requireEngineScope(requested);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id আবশ্যক।' }, { status: 400 });

  const before = await db.acquisitionCampaign.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });
  if (scope.scope.clientId && before.clientId !== scope.scope.clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body.objective === 'string') data.objective = body.objective.trim() || null;
  if (typeof body.budgetPreference === 'string' && VALID_BUDGET.includes(body.budgetPreference)) {
    data.budgetPreference = body.budgetPreference;
  }
  if (typeof body.autonomy === 'string' && VALID_AUTONOMY.includes(body.autonomy)) {
    data.autonomy = body.autonomy;
  }
  if (typeof body.status === 'string' && VALID_STATUS.includes(body.status)) data.status = body.status;
  if (Array.isArray(body.sourceKeys)) data.sourceKeys = JSON.stringify(body.sourceKeys);
  if (typeof body.profileId === 'string') {
    const profile = await db.targetingProfile.findUnique({ where: { id: body.profileId } });
    if (!profile || profile.clientId !== before.clientId) {
      return NextResponse.json({ error: 'প্রোফাইল এই টেন্যান্টের নয়।' }, { status: 403 });
    }
    data.profileId = body.profileId;
  }

  const after = await db.acquisitionCampaign.update({ where: { id }, data });
  await writeAudit({
    clientId: before.clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'campaign.update',
    resource: 'acquisition_campaign',
    resourceId: id,
    before,
    after,
  });
  return NextResponse.json({ ok: true });
}
