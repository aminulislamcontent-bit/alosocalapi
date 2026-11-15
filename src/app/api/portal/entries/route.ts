import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { getTemplate } from '@/lib/platforms';
import { credentialPresence, storeCredentialValue } from '@/lib/security/credential-vault';
import { decryptCredentialTransfer } from '@/lib/security/credential-transfer';
import { isSameOriginRequest } from '@/lib/security/request';

export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'client' || !user.clientId) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const client = await db.clientAccount.findUnique({ where: { id: user.clientId }, include: { entries: true } });
  if (!client) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  return NextResponse.json({
    client: {
      id: client.id, name: client.name, business: client.business, username: client.username,
      status: client.status, createdAt: client.createdAt.toISOString(),
      completedAt: client.completedAt?.toISOString() ?? null,
      platforms: JSON.parse(client.platforms) as string[],
    },
    // Secrets are never re-sent to the browser. Re-enter a value to replace it.
    entries: client.entries.map(e => ({
      platform: e.platform, fieldKey: e.fieldKey, ...credentialPresence(e.value),
      status: e.status, updatedAt: e.updatedAt.toISOString(),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const user = await getSessionUser();
  if (user?.role !== 'client' || !user.clientId) return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  const client = await db.clientAccount.findUnique({ where: { id: user.clientId } });
  if (!client) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  if (client.status !== 'active') return NextResponse.json({ error: 'This account is not active.' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { platform?: string; fieldKey?: string; transfer?: unknown; value?: unknown; status?: string };
  const platform = body.platform ?? '';
  const fieldKey = body.fieldKey ?? '';
  const status = body.status === 'skipped' ? 'skipped' : 'collected';
  const template = getTemplate(platform);
  const platforms = JSON.parse(client.platforms) as string[];
  if (!template || !platforms.includes(platform)) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 });
  if (!template.fields.some(field => field.key === fieldKey)) return NextResponse.json({ error: 'Unknown field.' }, { status: 400 });
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

  let storedValue = '';
  try { storedValue = status === 'skipped' ? '' : storeCredentialValue(value); }
  catch { return NextResponse.json({ error: 'Encrypted vault is not configured; ask the administrator to set ALOAPI_VAULT_KEY.' }, { status: 503 }); }

  const entry = await db.credentialEntry.upsert({
    where: { clientId_platform_fieldKey: { clientId: client.id, platform, fieldKey } },
    create: { clientId: client.id, platform, fieldKey, value: storedValue, status },
    update: { value: storedValue, status },
  });
  await db.activityLog.create({ data: {
    clientId: client.id, actor: 'client', action: status === 'skipped' ? 'credential_skip' : 'credential_save',
    detail: `${platform}.${fieldKey}: ${status}`,
  } });
  return NextResponse.json({ ok: true, entry: {
    platform: entry.platform, fieldKey: entry.fieldKey, ...credentialPresence(entry.value),
    status: entry.status, updatedAt: entry.updatedAt.toISOString(),
  } }, { headers: { 'Cache-Control': 'no-store' } });
}
