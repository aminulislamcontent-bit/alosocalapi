import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireClient } from '@/lib/setupbot-guard';
import { getSbPlatform } from '@/lib/setupbot';
import { validatePlatform } from '@/lib/setupbot-validators';

/**
 * POST /api/setupbot/validate  { platform }
 * Runs format + live validation over the client's saved values for that
 * platform, persists the verdict on every collected field, returns result.
 */
export async function POST(req: NextRequest) {
  const auth = await requireClient();
  if ('error' in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { platform?: string };
  const platform = body.platform ?? '';
  const tpl = getSbPlatform(platform);
  if (!tpl) return NextResponse.json({ error: 'অপরিচিত প্ল্যাটফর্ম।' }, { status: 400 });

  const entries = await db.credentialEntry.findMany({
    where: { clientId: auth.client.id, platform, status: 'collected' },
  });
  if (entries.length === 0) {
    return NextResponse.json({ error: 'প্রথমে অন্তত একটি ভ্যালু সংরক্ষণ করুন।' }, { status: 400 });
  }

  const values: Record<string, string> = {};
  for (const e of entries) values[e.fieldKey] = e.value;

  const result = await validatePlatform(platform, values);

  const now = new Date();
  await db.credentialEntry.updateMany({
    where: { clientId: auth.client.id, platform, status: 'collected' },
    data: { validationStatus: result.status, validationNote: result.note, validatedAt: now },
  });

  await db.activityLog.create({
    data: {
      clientId: auth.client.id,
      actor: 'client',
      action: 'setupbot_validate',
      detail: `${platform} → ${result.status}`,
    },
  });

  return NextResponse.json({ platform, ...result, ok: result.ok ?? true });
}
