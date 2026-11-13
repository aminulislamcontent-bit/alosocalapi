import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import {
  SESSION_COOKIE,
  CLIENT_SESSION_HOURS,
  ADMIN_SESSION_HOURS,
  createSession,
  ensureSeed,
  verifyPassword,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  await ensureSeed();

  let body: { username?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'অনুরোধটি সঠিক নয়।' }, { status: 400 });
  }

  const username = (body.username ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const role = body.role === 'admin' ? 'admin' : 'client';

  if (!username || !password) {
    return NextResponse.json({ error: 'ইউজারনেম ও পাসওয়ার্ড দিন।' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const userAgent = req.headers.get('user-agent') ?? 'unknown';

  if (role === 'admin') {
    const admin = await db.adminUser.findUnique({ where: { username } });
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      return NextResponse.json({ error: 'অ্যাডমিন ইউজারনেম বা পাসওয়ার্ড ভুল।' }, { status: 401 });
    }
    const raw = await createSession({ role: 'admin', adminId: admin.id, ip, userAgent });
    const store = await cookies();
    store.set(SESSION_COOKIE, raw, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_SESSION_HOURS * 3600,
    });
    await db.activityLog.create({
      data: { actor: 'admin', action: 'admin_login', detail: `Admin ${admin.username} logged in`, ip },
    });
    return NextResponse.json({ ok: true, role: 'admin' });
  }

  // ── Client login ──
  const client = await db.clientAccount.findUnique({ where: { username } });
  if (!client || !verifyPassword(password, client.passwordHash)) {
    return NextResponse.json({ error: 'ইউজারনেম বা পাসওয়ার্ড ভুল।' }, { status: 401 });
  }

  if (client.status === 'completed') {
    return NextResponse.json(
      {
        error:
          'তথ্য সংগ্রহ ইতিমধ্যে সম্পন্ন হয়েছে এবং এই অ্যাকাউন্টটি লক করা হয়েছে। আপনার দেওয়া সাময়িক পাসওয়ার্ড এখন নিষ্ক্রিয় — এটি নিরাপদে পরিবর্তন করে নিন।',
      },
      { status: 403 }
    );
  }

  if (client.status === 'locked') {
    return NextResponse.json(
      { error: 'এই অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে। এজেন্সির সাথে যোগাযোগ করুন।' },
      { status: 403 }
    );
  }

  const raw = await createSession({ role: 'client', clientId: client.id, ip, userAgent });
  const store = await cookies();
  store.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CLIENT_SESSION_HOURS * 3600,
  });

  await db.activityLog.create({
    data: {
      clientId: client.id,
      actor: 'client',
      action: 'client_login',
      detail: `${client.name} (${client.business}) logged in`,
      ip,
    },
  });

  return NextResponse.json({ ok: true, role: 'client' });
}
