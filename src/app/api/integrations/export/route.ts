import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { createIntegrationPackage } from '@/lib/intelligence/export-package';
import { AUTOMATION_CATALOG, SOCIAL_API_CATALOG } from '@/lib/intelligence/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOG = [...SOCIAL_API_CATALOG, ...AUTOMATION_CATALOG];

/** Admin-only, offline package download. It contains catalog guidance and aggregate counts only. */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Administrator login required.' }, { status: 401 });

  try {
    const accountRows = await db.integrationAccount.findMany({ select: { providerKey: true, verificationStatus: true } });
    const counts = new Map<string, { recorded: number; configured: number }>();
    for (const row of accountRows) {
      const stats = counts.get(row.providerKey) ?? { recorded: 0, configured: 0 };
      stats.recorded += 1;
      if (row.verificationStatus === 'CONFIGURED') stats.configured += 1;
      counts.set(row.providerKey, stats);
    }
    const generatedAt = new Date().toISOString();
    const packageResult = createIntegrationPackage(CATALOG.map(provider => {
      const stats = counts.get(provider.key) ?? { recorded: 0, configured: 0 };
      return {
        ...provider,
        lastCheckedAt: null,
        recordedAccounts: stats.recorded,
        configuredAccounts: stats.configured,
        authorizedAccounts: 0,
        verifiedAccounts: 0,
      };
    }), generatedAt);
    const filename = `aloapi-integration-intelligence-${generatedAt.slice(0, 10)}.tar.gz`;
    return new NextResponse(new Uint8Array(packageResult.archive), {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(packageResult.archive.byteLength),
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'X-ALOAPI-Package-SHA256': packageResult.sha256,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Integration export is unavailable. Apply the reviewed additive database migrations and try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
