import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateTempPassword, generateUsername, getSessionUser, hashPassword } from '@/lib/auth';
import { getTemplate } from '@/lib/platforms';

/** GET /api/admin/clients — list all clients with progress */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const clients = await db.clientAccount.findMany({
    include: { entries: true },
    orderBy: { createdAt: 'desc' },
  });

  const list = clients.map(c => {
    const platforms = JSON.parse(c.platforms) as string[];
    const collected = c.entries.filter(e => e.status === 'collected').length;
    const skipped = c.entries.filter(e => e.status === 'skipped').length;
    const done = collected + skipped;
    return {
      id: c.id,
      name: c.name,
      business: c.business,
      phone: c.phone,
      username: c.username,
      status: c.status,
      platforms,
      createdAt: c.createdAt.toISOString(),
      completedAt: c.completedAt?.toISOString() ?? null,
      stats: { collected, skipped, done },
    };
  });

  return NextResponse.json({ clients: list });
}

/** POST /api/admin/clients — create client account with temp credentials */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'অননুমোদিত।' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    business?: string;
    phone?: string;
    platforms?: string[];
  };

  const name = (body.name ?? '').trim();
  const business = (body.business ?? '').trim();
  const phone = (body.phone ?? '').trim() || null;
  const platforms = (body.platforms ?? []).filter(p => getTemplate(p));

  if (!name || !business) {
    return NextResponse.json({ error: 'ক্লায়েন্টের নাম ও ব্যবসার নাম দিন।' }, { status: 400 });
  }
  if (platforms.length === 0) {
    return NextResponse.json({ error: 'অন্তত একটি প্ল্যাটফর্ম সিলেক্ট করুন।' }, { status: 400 });
  }

  // Unique username & password
  let username = generateUsername(business);
  for (let i = 0; i < 5; i++) {
    const exists = await db.clientAccount.findUnique({ where: { username } });
    if (!exists) break;
    username = generateUsername(business);
  }
  const tempPassword = generateTempPassword();

  const client = await db.clientAccount.create({
    data: {
      name,
      business,
      phone,
      username,
      passwordHash: hashPassword(tempPassword),
      platforms: JSON.stringify(platforms),
      status: 'active',
    },
  });

  await db.activityLog.create({
    data: {
      clientId: client.id,
      actor: 'admin',
      action: 'client_created',
      detail: `Account created for ${name} (${business}) with ${platforms.length} platforms`,
    },
  });

  return NextResponse.json({
    ok: true,
    client: { id: client.id, name, business, username },
    tempPassword,
  });
}
