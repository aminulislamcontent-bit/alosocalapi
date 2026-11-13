import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { geocode } from '@/lib/engine/adapters/nominatim';
import { writeAudit } from '@/lib/engine/audit';

// ─── Geographic targeting reference (§2): countries + admin areas ───

export async function GET(req: NextRequest) {
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? '';
  const region = req.nextUrl.searchParams.get('region')?.trim() ?? '';

  const countries = await db.geoCountry.findMany({ where: { active: true }, orderBy: { nameEn: 'asc' } });
  const filtered = countries.filter(
    c =>
      (!q || c.nameEn.toLowerCase().includes(q) || c.nameBn.includes(q) || c.code.toLowerCase() === q) &&
      (!region || c.region === region),
  );

  const areas = scope.scope.clientId
    ? await db.geoArea.findMany({
        where: { countryCode: { in: filtered.slice(0, 50).map(c => c.code) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    : [];

  return NextResponse.json({
    total: filtered.length,
    countries: filtered.map(c => ({
      code: c.code,
      nameEn: c.nameEn,
      nameBn: c.nameBn,
      region: c.region,
      currency: c.currency,
    })),
    areas: areas.map(a => ({
      id: a.id,
      countryCode: a.countryCode,
      admin1: a.admin1,
      city: a.city,
      postal: a.postal,
      lat: a.lat,
      lon: a.lon,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    countryCode?: string;
    admin1?: string;
    city?: string;
    postal?: string;
    geocode?: boolean;
  };
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const countryCode = (body.countryCode ?? '').trim().toUpperCase();
  if (!countryCode) return NextResponse.json({ error: 'countryCode আবশ্যক।' }, { status: 400 });
  const country = await db.geoCountry.findUnique({ where: { code: countryCode } });
  if (!country) return NextResponse.json({ error: 'অজানা দেশ কোড।' }, { status: 400 });

  let lat: number | null = null;
  let lon: number | null = null;
  if (body.geocode !== false && (body.city || body.admin1)) {
    const g = await geocode(`${body.city ?? ''} ${body.admin1 ?? ''} ${country.nameEn}`.trim(), {
      countryCode,
      clientId: scope.scope.clientId,
    });
    if (g.status === 'verified' && g.results[0]) {
      lat = g.results[0].lat;
      lon = g.results[0].lon;
    }
  }

  const area = await db.geoArea.create({
    data: {
      countryCode,
      admin1: body.admin1?.trim() || null,
      city: body.city?.trim() || null,
      postal: body.postal?.trim() || null,
      lat,
      lon,
      custom: true,
    },
  });

  await writeAudit({
    clientId: scope.scope.clientId,
    actor: scope.scope.user.username ?? scope.scope.user.name ?? 'user',
    actorRole: scope.scope.user.role,
    action: 'geo.add_area',
    resource: 'geo_area',
    resourceId: area.id,
    after: area,
  });
  return NextResponse.json({ ok: true, area });
}
