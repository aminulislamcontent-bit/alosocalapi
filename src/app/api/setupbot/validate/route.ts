import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireClient } from '@/lib/setupbot-guard';
import { getSbPlatform } from '@/lib/setupbot';
import { validatePlatform } from '@/lib/setupbot-validators';
import { readCredentialValue } from '@/lib/security/credential-vault';
import { isSameOriginRequest } from '@/lib/security/request';

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const auth = await requireClient(req);
  if ('error' in auth) return auth.error;
  const body = await req.json().catch(() => ({})) as { platform?: string };
  const platform = body.platform ?? '';
  if (!getSbPlatform(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 });
  const entries = await db.credentialEntry.findMany({ where: { clientId: auth.client.id, platform, status: 'collected' } });
  if (entries.length === 0) return NextResponse.json({ error: 'Save at least one value first.' }, { status: 400 });

  const values: Record<string, string> = {};
  try {
    for (const entry of entries) values[entry.fieldKey] = readCredentialValue(entry.value).plaintext;
  } catch {
    return NextResponse.json({ error: 'The vault key is missing or cannot decrypt this value; no provider request was made.' }, { status: 503 });
  }
  const result = await validatePlatform(platform, values);
  const now = new Date();
  await db.credentialEntry.updateMany({
    where: { clientId: auth.client.id, platform, status: 'collected' },
    data: { validationStatus: result.status, validationNote: result.note, validatedAt: now },
  });
  await db.activityLog.create({ data: {
    clientId: auth.client.id, actor: 'client', action: 'setupbot_format_check',
    detail: `${platform} → ${result.status}; offline only`,
  } });
  return NextResponse.json({ platform, ...result, ok: result.ok }, { headers: { 'Cache-Control': 'no-store' } });
}
