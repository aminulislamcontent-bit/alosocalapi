import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, destroySession } from '@/lib/auth';
import { isSameOriginRequest } from '@/lib/security/request';

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  await destroySession();
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
