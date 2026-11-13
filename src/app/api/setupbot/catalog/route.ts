import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { SB_CATEGORIES, SB_TOTAL_PLATFORMS, SB_TOTAL_FIELDS, SB_VERSION } from '@/lib/setupbot';

/** GET /api/setupbot/catalog — full platform library (auth required) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'লগইন প্রয়োজন।' }, { status: 401 });
  }

  return NextResponse.json({
    version: SB_VERSION,
    totals: { categories: SB_CATEGORIES.length, platforms: SB_TOTAL_PLATFORMS, fields: SB_TOTAL_FIELDS },
    categories: SB_CATEGORIES.map(c => ({
      key: c.key,
      emoji: c.emoji,
      name: c.name,
      bn: c.bn,
      desc: c.desc,
      grad: c.grad,
      platforms: c.platforms.map(p => ({
        key: p.key,
        name: p.name,
        bn: p.bn,
        icon: p.icon,
        grad: p.grad,
        vHint: p.vHint ?? null,
        expiry: p.expiry ?? null,
        fields: p.fields,
      })),
    })),
  });
}
