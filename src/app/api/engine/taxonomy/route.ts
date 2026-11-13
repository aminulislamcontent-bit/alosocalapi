import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { writeAudit } from '@/lib/engine/audit';

// ─── Dynamic industry taxonomy (§2): admin-extensible, zero rewrites ─

export async function GET() {
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const rows = await db.industryTaxonomy.findMany({ orderBy: [{ level: 'asc' }, { nameEn: 'asc' }] });
  const categories = rows.filter(r => r.level === 1);
  const subs = rows.filter(r => r.level === 2);
  return NextResponse.json({
    categories: categories.map(c => ({
      slug: c.slug,
      nameEn: c.nameEn,
      nameBn: c.nameBn,
      custom: c.custom,
      active: c.active,
      keywords: JSON.parse(c.keywords || '[]'),
      subIndustries: subs
        .filter(s => s.parentSlug === c.slug)
        .map(s => ({ slug: s.slug, nameEn: s.nameEn, nameBn: s.nameBn, custom: s.custom, active: s.active })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    nameEn?: string;
    nameBn?: string;
    parentSlug?: string | null;
    keywords?: string[];
  };
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  if (scope.scope.user.role !== 'admin') {
    return NextResponse.json({ error: 'শুধু গ্লোবাল অ্যাডমিন নতুন ইন্ডাস্ট্রি যোগ করতে পারেন।' }, { status: 403 });
  }

  const nameEn = (body.nameEn ?? '').trim();
  if (!nameEn) return NextResponse.json({ error: 'nameEn আবশ্যক।' }, { status: 400 });

  const slug =
    nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') ||
    `custom_${Date.now()}`;
  const parent = body.parentSlug ?? null;
  const level = parent ? 2 : 1;

  const exists = await db.industryTaxonomy.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: 'এই slug আগেই আছে।' }, { status: 409 });

  const row = await db.industryTaxonomy.create({
    data: {
      slug,
      nameEn,
      nameBn: (body.nameBn ?? '').trim() || nameEn,
      parentSlug: parent,
      level,
      keywords: JSON.stringify(body.keywords?.length ? body.keywords : [nameEn.toLowerCase()]),
      custom: true,
    },
  });

  await writeAudit({
    actor: scope.scope.user.username ?? 'admin',
    actorRole: 'admin',
    action: 'taxonomy.add_industry',
    resource: 'industry_taxonomy',
    resourceId: row.id,
    after: row,
  });
  return NextResponse.json({ ok: true, industry: row });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { slug?: string; active?: boolean };
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  if (scope.scope.user.role !== 'admin') {
    return NextResponse.json({ error: 'শুধু গ্লোবাল অ্যাডমিন পরিবর্তন করতে পারেন।' }, { status: 403 });
  }
  if (!body.slug) return NextResponse.json({ error: 'slug আবশ্যক।' }, { status: 400 });

  const before = await db.industryTaxonomy.findUnique({ where: { slug: body.slug } });
  if (!before) return NextResponse.json({ error: 'পাওয়া যায়নি।' }, { status: 404 });

  const after = await db.industryTaxonomy.update({
    where: { slug: body.slug },
    data: { active: body.active ?? before.active },
  });
  await writeAudit({
    actor: scope.scope.user.username ?? 'admin',
    actorRole: 'admin',
    action: 'taxonomy.update',
    resource: 'industry_taxonomy',
    resourceId: after.id,
    before: { active: before.active },
    after: { active: after.active },
  });
  return NextResponse.json({ ok: true });
}
