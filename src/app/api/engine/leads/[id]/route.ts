import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';

// ─── Lead detail: full evidence trail + activity history (§6, §8) ───

function json<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await requireEngineScope(req.nextUrl.searchParams.get('clientId'));
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const clientId = scope.scope.clientId;
  if (!clientId) return NextResponse.json({ error: 'টেন্যান্ট নির্বাচন করুন।' }, { status: 400 });

  const lead = await db.acqLead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: 'লিড পাওয়া যায়নি।' }, { status: 404 });
  if (lead.clientId !== clientId) {
    return NextResponse.json({ error: 'টেন্যান্ট আইসোলেশন ভায়োলেশন।' }, { status: 403 });
  }

  const activities = await db.acqLeadActivity.findMany({
    where: { leadId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({
    lead: {
      ...lead,
      evidence: json<Record<string, unknown>[]>(lead.evidence, []),
      scoreBreakdown: lead.scoreBreakdown ? JSON.parse(lead.scoreBreakdown) : null,
      intentSignals: json<string[]>(lead.intentSignals, []),
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      firstSeenAt: lead.firstSeenAt.toISOString(),
      lastSeenAt: lead.lastSeenAt.toISOString(),
      freshnessAt: lead.freshnessAt?.toISOString() ?? null,
    },
    activities: activities.map(a => ({
      id: a.id,
      type: a.type,
      actor: a.actor,
      data: JSON.parse(a.data || '{}'),
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
