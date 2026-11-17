import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { isSameOriginRequest } from './request';

export interface AdminSessionUser extends SessionUser {
  role: 'admin';
  username: string;
}

export async function requireAdminApi(req?: NextRequest, requireCsrf = false): Promise<
  | { ok: true; user: AdminSessionUser; ip: string }
  | { ok: false; response: NextResponse }
> {
  if (requireCsrf && req && !isSameOriginRequest(req)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 }),
    };
  }
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Administrator login required.' }, { status: 401 }),
    };
  }
  const adminUser: AdminSessionUser = {
    ...user,
    role: 'admin',
    username: user.username || 'admin',
  };
  const ip = req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  return { ok: true, user: adminUser, ip };
}
