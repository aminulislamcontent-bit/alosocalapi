import { NextRequest, NextResponse } from 'next/server';
import { processEmailUnsubscribe } from '@/lib/factory/modules/email-marketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * RFC 8058 One-Click Unsubscribe Endpoint (authorized solely by unguessable per-contact token).
 */
export async function POST(req: NextRequest) {
  const tokenParam = req.nextUrl.searchParams.get('token');
  const body = (await req.json().catch(() => null)) as { token?: string; reason?: string } | null;
  const token = tokenParam || body?.token || '';
  if (!token) {
    return NextResponse.json({ error: 'Unsubscribe token is required.' }, { status: 400 });
  }

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const contact = await processEmailUnsubscribe({
      unsubscribeToken: token,
      reason: body?.reason || 'rfc8058_one_click_unsubscribe',
      ip,
    });
    return NextResponse.json({ ok: true, unsubscribed: true, email: contact.email });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unsubscribe failed.' }, { status: 404 });
  }
}
