import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { generateContentDraft, type Platform } from '@/lib/engine/ai';
import { writeAudit } from '@/lib/engine/audit';

// ─── Social growth content calendar (§10) with approval gates ───────
// No fake followers / no auto-engagement / no unsolicited DMs.

const PLATFORMS = new Set<Platform>(['facebook', 'instagram', 'youtube', 'linkedin', 'tiktok', 'x']);
const STATUS_FLOW: Record<string, string[]> = {
  draft: ['awaiting_approval', 'rejected'],
  idea: ['awaiting_approval', 'rejected'],
  awaiting_approval: ['approved', 'rejected'],
  approved: ['published', 'rejected'],
  published: [],
  rejected: [],
};

export async function GET(req: NextRequest) {
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ items: [] });

  const items = await db.contentItem.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({
    items: items.map(i => ({
      id: i.id,
      platform: i.platform,
      draft: i.draft,
      hashtags: JSON.parse(i.hashtags || '[]'),
      status: i.status,
      scheduledFor: i.scheduledFor?.toISOString() ?? null,
      approvedBy: i.approvedBy,
      publishedAt: i.publishedAt?.toISOString() ?? null,
      updatedAt: i.updatedAt.toISOString(),
    })),
    policy: {
      note: 'ফলোয়ার কেনা নেই, ফেক এনগেজমেন্ট নেই, অনাকাঙ্ক্ষিত বাল্ক মেসেজ নেই। প্রকাশনার আগে অনুমোদন আবশ্যক; প্রকৃত পোস্ট অফিসিয়াল API/ম্যানুয়াল করে।',
    },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    platform?: string;
    topic?: string;
    lang?: string;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট নির্বাচন করুন।' }, { status: 400 });

  const platform = (body.platform ?? '') as Platform;
  if (!PLATFORMS.has(platform)) {
    return NextResponse.json({ error: `platform হতে হবে: ${[...PLATFORMS].join(', ')}` }, { status: 400 });
  }
  const topic = (body.topic ?? '').trim();
  if (!topic) return NextResponse.json({ error: 'টপিক/কনটেন্ট ব্রিফ দিন।' }, { status: 400 });

  const client = await db.clientAccount.findUnique({ where: { id: clientId } });
  const lang = body.lang === 'en' ? 'en' : 'bn';
  const draft = generateContentDraft({
    business: client?.business ?? client?.name ?? 'Our business',
    platform,
    topic,
    lang,
  });

  const item = await db.contentItem.create({
    data: {
      clientId,
      platform,
      draft: draft.draft,
      hashtags: JSON.stringify(draft.hashtags),
      status: 'draft',
    },
  });

  await writeAudit({
    clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'content.generate',
    resource: 'content_item',
    resourceId: item.id,
    after: { platform, origin: draft.origin },
  });

  return NextResponse.json({
    ok: true,
    item: {
      id: item.id,
      platform: item.platform,
      draft: item.draft,
      hashtags: draft.hashtags,
      status: item.status,
      origin: draft.origin,
    },
    note: 'origin=rule_template — এই প্রজেক্টে AI কনফিগ নেই, তাই টেমপ্লেট-ভিত্তিক ড্রাফট; মানুষ সম্পাদনা করে নেবেন।',
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    id?: string;
    status?: string;
  };
  const scope = await requireEngineScope(body.clientId ?? null);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId || !body.id || !body.status) {
    return NextResponse.json({ error: 'id + status আবশ্যক।' }, { status: 400 });
  }

  const item = await db.contentItem.findUnique({ where: { id: body.id } });
  if (!item) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });
  if (item.clientId !== clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const allowed = STATUS_FLOW[item.status] ?? [];
  if (!allowed.includes(body.status)) {
    return NextResponse.json(
      { error: `"${item.status}" থেকে "${body.status}"-এ যাওয়া যায় না। অনুমোদিত: ${allowed.join(', ') || 'কোনোটি নয়'}` },
      { status: 400 },
    );
  }
  // Approval transitions are admin decisions (§12)
  if (body.status === 'approved' && scope.scope.user.role !== 'admin') {
    return NextResponse.json({ error: 'প্রকাশনার অনুমোদন শুধু অ্যাডমিন দিতে পারেন।' }, { status: 403 });
  }

  const data: Record<string, unknown> = { status: body.status, updatedAt: new Date() };
  if (body.status === 'approved') {
    data.approvedBy = scope.scope.user.username ?? 'admin';
  }
  if (body.status === 'published') {
    data.publishedAt = new Date();
  }

  const after = await db.contentItem.update({ where: { id: item.id }, data });
  await writeAudit({
    clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: `content.${body.status}`,
    resource: 'content_item',
    resourceId: item.id,
    before: { status: item.status },
    after: { status: after.status },
  });

  return NextResponse.json({
    ok: true,
    status: after.status,
    note:
      body.status === 'published'
        ? 'workflow রেকর্ড হিসেবে published — প্রকৃত পোস্ট অফিসিয়াল চ্যানেলে করা হয়েছে ধরে নেওয়া হয়েছে; অটো-পোস্টিং এখানে হয় না।'
        : undefined,
  });
}
