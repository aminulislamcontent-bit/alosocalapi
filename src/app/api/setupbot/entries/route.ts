import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireClient } from '@/lib/setupbot-guard';
import { getSbPlatform, getSbCategoryOf, SB_CATEGORIES } from '@/lib/setupbot';

/** GET /api/setupbot/entries — own SetupBot entries + per-category progress (resume data) */
export async function GET() {
  const auth = await requireClient();
  if ('error' in auth) return auth.error;

  const entries = await db.credentialEntry.findMany({
    where: { clientId: auth.client.id },
    orderBy: { updatedAt: 'asc' },
  });

  // Only count entries that belong to SetupBot platforms
  const sbEntries = entries.filter(e => getSbPlatform(e.platform));

  const byCategory = SB_CATEGORIES.map(c => {
    const done = sbEntries.filter(e => getSbCategoryOf(e.platform)?.key === c.key);
    return { key: c.key, collected: done.filter(e => e.status === 'collected').length, touched: done.length };
  });

  return NextResponse.json({
    client: { id: auth.client.id, name: auth.client.name, username: auth.client.username, status: auth.client.status },
    entries: sbEntries.map(e => ({
      platform: e.platform,
      fieldKey: e.fieldKey,
      value: e.value,
      status: e.status,
      validationStatus: e.validationStatus,
      validationNote: e.validationNote,
      validatedAt: e.validatedAt?.toISOString() ?? null,
      updatedAt: e.updatedAt.toISOString(),
    })),
    byCategory,
  });
}

/** PUT /api/setupbot/entries — save/skip one field (SetupBot library validation) */
export async function PUT(req: NextRequest) {
  const auth = await requireClient();
  if ('error' in auth) return auth.error;

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

  const tpl = getSbPlatform(platform);
  if (!tpl) return NextResponse.json({ error: 'অপরিচিত প্ল্যাটফর্ম।' }, { status: 400 });
  const field = tpl.fields.find(f => f.k === fieldKey);
  if (!field) return NextResponse.json({ error: 'অপরিচিত ফিল্ড।' }, { status: 400 });
  if (status === 'collected' && !value) {
    return NextResponse.json({ error: 'ভ্যালু খালি রাখা যাবে না।' }, { status: 400 });
  }

  const entry = await db.credentialEntry.upsert({
    where: { clientId_platform_fieldKey: { clientId: auth.client.id, platform, fieldKey } },
    create: { clientId: auth.client.id, platform, fieldKey, value, status },
    update: {
      value: status === 'skipped' ? '' : value,
      status,
      // editing a value resets any previous validation verdict
      validationStatus: 'none',
      validationNote: '',
      validatedAt: null,
    },
  });

  await db.activityLog.create({
    data: {
      clientId: auth.client.id,
      actor: 'client',
      action: status === 'skipped' ? 'setupbot_skip' : 'setupbot_save',
      detail: `${platform}.${fieldKey} (${mask(value)})`,
    },
  });

  return NextResponse.json({
    ok: true,
    entry: {
      platform: entry.platform,
      fieldKey: entry.fieldKey,
      value: entry.value,
      status: entry.status,
      validationStatus: entry.validationStatus,
      validationNote: entry.validationNote,
      validatedAt: entry.validatedAt?.toISOString() ?? null,
    },
  });
}

/** Never log full values — first 4 + last 4 only */
function mask(v: string): string {
  if (!v) return '—';
  if (v.length <= 8) return v.slice(0, 2) + '…' + v.slice(-2);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
