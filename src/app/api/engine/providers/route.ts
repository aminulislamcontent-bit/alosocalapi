import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireEngineScope } from '@/lib/engine/guard';
import { syncProviderRegistry } from '@/lib/engine/registry';

// ─── Provider registry view (§4): honest status for every source ────

export async function GET() {
  const scope = await requireEngineScope();
  if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status });

  await syncProviderRegistry(); // idempotent — seeds any missing catalog rows

  const rows = await db.providerRegistry.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
  return NextResponse.json({
    providers: rows.map(r => ({
      key: r.key,
      name: r.name,
      category: r.category,
      sourceUrl: r.sourceUrl,
      accessMethod: r.accessMethod,
      dataFields: JSON.parse(r.dataFields || '[]'),
      authRequired: r.authRequired,
      freeTier: JSON.parse(r.freeTier || '{}'),
      paidTier: JSON.parse(r.paidTier || '{}'),
      rateLimit: JSON.parse(r.rateLimit || '{}'),
      licensing: r.licensing,
      geoCoverage: r.geoCoverage,
      integrationStatus: r.integrationStatus,
      reliability: r.reliability,
      notes: r.notes,
      lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
      lastCheck: r.lastCheck ? JSON.parse(r.lastCheck) : null,
    })),
  });
}
