import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { writeAudit } from '@/lib/engine/audit';

// ─── Reusable targeting profiles (§3 Mode B) — tenant-scoped ────────

function json<T>(v: unknown, fallback: T): T {
  if (v === undefined || v === null) return fallback;
  try {
    return typeof v === 'string' ? (JSON.parse(v) as T) : (v as T);
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get('clientId');
  const scope = await requireEngineScope(requested);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ profiles: [] });

  const profiles = await db.targetingProfile.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({
    profiles: profiles.map(p => ({
      id: p.id,
      name: p.name,
      industries: JSON.parse(p.industries || '[]'),
      countries: JSON.parse(p.countries || '[]'),
      areas: JSON.parse(p.areas || '[]'),
      audience: p.audience,
      keywords: JSON.parse(p.keywords || '[]'),
      intentSignals: JSON.parse(p.intentSignals || '[]'),
      competitorRefs: JSON.parse(p.competitorRefs || '[]'),
      exclusions: JSON.parse(p.exclusions || '[]'),
      updatedAt: p.updatedAt.toISOString(),
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
  if (!name) return NextResponse.json({ error: 'প্রোফাইলের নাম দিন।' }, { status: 400 });

  const profile = await db.targetingProfile.create({
    data: {
      clientId,
      name,
      industries: JSON.stringify(json<string[]>(body.industries, [])),
      countries: JSON.stringify(json<string[]>(body.countries, [])),
      areas: JSON.stringify(json<string[]>(body.areas, [])),
      audience: typeof body.audience === 'string' ? body.audience.trim() || null : null,
      keywords: JSON.stringify(json<string[]>(body.keywords, [])),
      intentSignals: JSON.stringify(json<string[]>(body.intentSignals, [])),
      competitorRefs: JSON.stringify(json<string[]>(body.competitorRefs, [])),
      exclusions: JSON.stringify(json<string[]>(body.exclusions, [])),
    },
  });

  await writeAudit({
    clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'profile.create',
    resource: 'targeting_profile',
    resourceId: profile.id,
    after: profile,
  });
  return NextResponse.json({ ok: true, profileId: profile.id });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requested = typeof body.clientId === 'string' ? body.clientId : null;
  const scope = await requireEngineScope(requested);
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id আবশ্যক।' }, { status: 400 });

  const before = await db.targetingProfile.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });
  if (scope.scope.clientId && before.clientId !== scope.scope.clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  for (const k of ['industries', 'countries', 'areas', 'keywords', 'intentSignals', 'competitorRefs', 'exclusions'] as const) {
    if (body[k] !== undefined) data[k] = JSON.stringify(json<string[]>(body[k], []));
  }
  if (body.audience !== undefined) data.audience = typeof body.audience === 'string' ? body.audience.trim() || null : null;

  const after = await db.targetingProfile.update({ where: { id }, data });
  await writeAudit({
    clientId: before.clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'profile.update',
    resource: 'targeting_profile',
    resourceId: id,
    before,
    after,
  });
  return NextResponse.json({ ok: true });
}
