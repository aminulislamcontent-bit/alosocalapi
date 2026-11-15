import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireClient } from '@/lib/setupbot-guard';
import { getSbPlatform, getSbCategoryOf, SB_CATEGORIES } from '@/lib/setupbot';
import { credentialPresence, storeCredentialValue } from '@/lib/security/credential-vault';
import { decryptCredentialTransfer } from '@/lib/security/credential-transfer';
import { isSameOriginRequest } from '@/lib/security/request';

export async function GET() {
  const auth = await requireClient();
  if ('error' in auth) return auth.error;
  const entries = await db.credentialEntry.findMany({ where: { clientId: auth.client.id }, orderBy: { updatedAt: 'asc' } });
  const setupEntries = entries.filter(entry => getSbPlatform(entry.platform));
  const byCategory = SB_CATEGORIES.map(category => {
    const subset = setupEntries.filter(entry => getSbCategoryOf(entry.platform)?.key === category.key);
    return { key: category.key, collected: subset.filter(entry => entry.status === 'collected').length, touched: subset.length };
  });
  return NextResponse.json({
    client: { id: auth.client.id, name: auth.client.name, username: auth.client.username, status: auth.client.status },
    entries: setupEntries.map(entry => ({
      platform: entry.platform, fieldKey: entry.fieldKey, ...credentialPresence(entry.value),
      status: entry.status, validationStatus: entry.validationStatus,
      validationNote: entry.validationNote, validatedAt: entry.validatedAt?.toISOString() ?? null,
      updatedAt: entry.updatedAt.toISOString(),
    })),
    byCategory,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const auth = await requireClient(req);
  if ('error' in auth) return auth.error;
  const body = await req.json().catch(() => ({})) as { platform?: string; fieldKey?: string; transfer?: unknown; value?: unknown; status?: string };
  const platform = body.platform ?? '';
  const fieldKey = body.fieldKey ?? '';
  const status = body.status === 'skipped' ? 'skipped' : 'collected';
  const template = getSbPlatform(platform);
  if (!template) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 });
  if (!template.fields.some(field => field.k === fieldKey)) return NextResponse.json({ error: 'Unknown field.' }, { status: 400 });
  if (status === 'collected' && body.value !== undefined) {
    return NextResponse.json({ error: 'Plaintext credential transfer is disabled. Submit a browser-encrypted transfer envelope.' }, { status: 400 });
  }
  let value = '';
  if (status === 'collected') {
    try { value = await decryptCredentialTransfer(body.transfer); }
    catch { return NextResponse.json({ error: 'Secure transfer was invalid or expired. Retry with a new transfer passphrase.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  }
  if (status === 'collected' && (!value || Buffer.byteLength(value, 'utf8') > 16_384)) {
    return NextResponse.json({ error: value ? 'Value is too large.' : 'Enter a value to save.' }, { status: 400 });
  }
  let encrypted = '';
  try { encrypted = status === 'skipped' ? '' : storeCredentialValue(value); }
  catch { return NextResponse.json({ error: 'Encrypted vault is not configured; ask the administrator to set ALOAPI_VAULT_KEY.' }, { status: 503 }); }
  const entry = await db.credentialEntry.upsert({
    where: { clientId_platform_fieldKey: { clientId: auth.client.id, platform, fieldKey } },
    create: { clientId: auth.client.id, platform, fieldKey, value: encrypted, status },
    update: { value: encrypted, status, validationStatus: 'none', validationNote: '', validatedAt: null },
  });
  await db.activityLog.create({ data: {
    clientId: auth.client.id, actor: 'client', action: status === 'skipped' ? 'setupbot_skip' : 'setupbot_save',
    detail: `${platform}.${fieldKey}: ${status}`,
  } });
  return NextResponse.json({ ok: true, entry: {
    platform: entry.platform, fieldKey: entry.fieldKey, ...credentialPresence(entry.value),
    status: entry.status, validationStatus: entry.validationStatus,
    validationNote: entry.validationNote, validatedAt: entry.validatedAt?.toISOString() ?? null,
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
