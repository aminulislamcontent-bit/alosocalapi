import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';

/** Shared guard: returns the authenticated client account or a NextResponse error */
export async function requireClient(req?: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'লগইন প্রয়োজন।' }, { status: 401 }) } as const;
  }
  if (user.role === 'client' && user.clientId) {
    const client = await db.clientAccount.findUnique({ where: { id: user.clientId } });
    if (!client) {
      return { error: NextResponse.json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 }) } as const;
    }
    if (client.status !== 'active') {
      return {
        error: NextResponse.json(
          { error: 'সংগ্রহ সম্পন্ন হয়েছে — অ্যাকাউন্ট এখন লক। পরিবর্তনের জন্য এজেন্সির সাথে যোগাযোগ করুন।' },
          { status: 403 }
        ),
      } as const;
    }
    return { client } as const;
  }
  return { error: NextResponse.json({ error: 'শুধু ক্লায়েন্ট সেশন এই কাজ করতে পারে।' }, { status: 403 }) } as const;
}

/** Guard for admin-or-own-client read access (export endpoints) */
export async function requireAdminOrClient(req: NextRequest, clientIdParam?: string) {
  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'লগইন প্রয়োজন।' }, { status: 401 }) } as const;
  }
  if (user.role === 'admin') {
    let clientId = clientIdParam ?? null;
    if (!clientId) {
      // admin without target → pick master or first client
      const first = await db.clientAccount.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!first) {
        return { error: NextResponse.json({ error: 'কোনো ক্লায়েন্ট নেই।' }, { status: 404 }) } as const;
      }
      clientId = first.id;
    }
    const client = await db.clientAccount.findUnique({ where: { id: clientId } });
    if (!client) {
      return { error: NextResponse.json({ error: 'ক্লায়েন্ট পাওয়া যায়নি।' }, { status: 404 }) } as const;
    }
    return { client, admin: true } as const;
  }
  if (user.role === 'client' && user.clientId) {
    if (clientIdParam && clientIdParam !== user.clientId) {
      return { error: NextResponse.json({ error: 'অন্য ক্লায়েন্টের ডেটা দেখার অনুমতি নেই।' }, { status: 403 }) } as const;
    }
    const client = await db.clientAccount.findUnique({ where: { id: user.clientId } });
    if (!client) {
      return { error: NextResponse.json({ error: 'অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 }) } as const;
    }
    return { client, admin: false } as const;
  }
  return { error: NextResponse.json({ error: 'অনুমতি নেই।' }, { status: 403 }) } as const;
}
