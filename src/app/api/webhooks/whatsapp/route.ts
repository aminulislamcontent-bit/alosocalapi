import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { decryptVaultValue, constantTimeEqual } from '@/lib/security/vault-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PROVIDER = 'whatsapp_cloud_api';

async function getConfiguredSecret(name: string): Promise<string> {
  const rows = await db.integrationSecret.findMany({ where: { providerKey: PROVIDER, name }, take: 2 });
  if (rows.length !== 1) throw new Error(rows.length ? 'AMBIGUOUS_SECRET' : 'SECRET_NOT_CONFIGURED');
  return decryptVaultValue(rows[0].ciphertext);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get('hub.mode') !== 'subscribe') return NextResponse.json({ error: 'Unsupported webhook verification mode.' }, { status: 400 });
  const token = params.get('hub.verify_token') ?? '';
  const challenge = params.get('hub.challenge') ?? '';
  if (!token || !challenge || challenge.length > 1024) return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
  try {
    const expected = await getConfiguredSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (!constantTimeEqual(token, expected)) return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 });
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Webhook verification is not configured for exactly one account.' }, { status: 503 });
  }
}

function eventNames(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['unknown'];
  const root = value as { entry?: unknown };
  if (!Array.isArray(root.entry)) return ['unknown'];
  const names = new Set<string>();
  for (const entry of root.entry) {
    if (!entry || typeof entry !== 'object') continue;
    const typedEntry = entry as { changes?: unknown; messaging?: unknown };
    if (Array.isArray(typedEntry.changes)) {
      for (const change of typedEntry.changes) {
        if (change && typeof change === 'object') {
          const field = (change as { field?: unknown }).field;
          if (typeof field === 'string') names.add(field.slice(0, 80));
        }
      }
    }
    if (Array.isArray(typedEntry.messaging)) names.add('messaging');
  }
  return [...names].slice(0, 20).length ? [...names].slice(0, 20) : ['unknown'];
}

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > 1_000_000) return NextResponse.json({ error: 'Webhook body too large.' }, { status: 413 });
  let raw: string;
  try { raw = await req.text(); } catch { return NextResponse.json({ error: 'Invalid webhook body.' }, { status: 400 }); }
  if (Buffer.byteLength(raw, 'utf8') > 1_000_000) return NextResponse.json({ error: 'Webhook body too large.' }, { status: 413 });
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  try {
    const appSecret = await getConfiguredSecret('WHATSAPP_APP_SECRET');
    const expected = `sha256=${createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex')}`;
    if (!constantTimeEqual(signature.toLowerCase(), expected.toLowerCase())) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid webhook JSON.' }, { status: 400 }); }
    const types = eventNames(payload);
    for (const eventType of types) await db.integrationWebhookEvent.create({ data: { providerKey: PROVIDER, eventType } });
    // Do not persist or echo the payload. No messages are sent and no CRM record is created.
    return NextResponse.json({ received: true, eventTypesRecorded: types.length }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification is not configured for exactly one account.' }, { status: 503 });
  }
}
