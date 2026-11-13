import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { getTemplate } from '@/lib/platforms';

/** GET /api/portal/entries — own platforms + entries + progress */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'client' || !user.clientId) {
    return NextResponse.json({ error: 'লগইন প্রয়োজন।' }, { status: 401 });
  }

  const client = await db.clientAccount.findUnique({
    where: { id: user.clientId },
    include: { entries: true },
  });
  if (!client) return NextResponse.json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      business: client.business,
      username: client.username,
      status: client.status,
      createdAt: client.createdAt.toISOString(),
      completedAt: client.completedAt?.toISOString() ?? null,
      platforms: JSON.parse(client.platforms) as string[],
    },
    entries: client.entries.map(e => ({
      platform: e.platform,
      fieldKey: e.fieldKey,
      value: e.value,
      status: e.status,
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
}

/** PUT /api/portal/entries — save/skip one credential field */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'client' || !user.clientId) {
    return NextResponse.json({ error: 'লগইন প্রয়োজন।' }, { status: 401 });
  }

  const client = await db.clientAccount.findUnique({ where: { id: user.clientId } });
  if (!client) return NextResponse.json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });
  if (client.status !== 'active') {
    return NextResponse.json(
      { error: 'সংগ্রহ সম্পন্ন হয়েছে — অ্যাকাউন্ট এখন লক। পরিবর্তনের জন্য এজেন্সির সাথে যোগাযোগ করুন।' },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    platform?: string;
    fieldKey?: string;
    value?: string;
    status?: string;
  };

  const platform = body.platform ?? '';
  const fieldKey = body.fieldKey ?? '';
  const status = body.status === 'skipped' ? 'skipped' : 'collected';
  const value = (body.value ?? '').trim();

  // Validate against template & assigned platforms
  const tpl = getTemplate(platform);
  const platforms = JSON.parse(client.platforms) as string[];
  if (!tpl || !platforms.includes(platform)) {
    return NextResponse.json({ error: 'অপরিচিত প্ল্যাটফর্ম।' }, { status: 400 });
  }
  const field = tpl.fields.find(f => f.key === fieldKey);
  if (!field) return NextResponse.json({ error: 'অপরিচিত ফিল্ড।' }, { status: 400 });
  if (status === 'collected' && !value) {
    return NextResponse.json({ error: 'ভ্যালু খালি রাখা যাবে না।' }, { status: 400 });
  }

  const entry = await db.credentialEntry.upsert({
    where: { clientId_platform_fieldKey: { clientId: client.id, platform, fieldKey } },
    create: { clientId: client.id, platform, fieldKey, value, status },
    update: { value: status === 'skipped' ? '' : value, status },
  });

  return NextResponse.json({
    ok: true,
    entry: { platform: entry.platform, fieldKey: entry.fieldKey, value: entry.value, status: entry.status },
  });
}
