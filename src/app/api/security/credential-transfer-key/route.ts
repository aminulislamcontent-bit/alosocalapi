import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { issueCredentialTransferKey } from '@/lib/security/credential-transfer';
import { isSameOriginRequest } from '@/lib/security/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  const user = await getSessionUser();
  if (user?.role !== 'admin' && user?.role !== 'client') {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }
  try {
    const key = await issueCredentialTransferKey();
    return NextResponse.json(key, {
      headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ALOAPI_VAULT_KEY_MISSING') {
      return NextResponse.json({ error: 'Secure credential transfer requires a stable ALOAPI_VAULT_KEY of at least 32 bytes.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    if (error instanceof Error && error.message === 'CREDENTIAL_TRANSFER_KEY_LIMIT') {
      return NextResponse.json({ error: 'Too many active credential transfers. Wait two minutes and try again.' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '120' } });
    }
    return NextResponse.json({ error: 'Secure credential transfer is unavailable. Confirm the additive database schema is applied.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
