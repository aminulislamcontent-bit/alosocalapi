import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { AUTOMATION_CATALOG, SOCIAL_API_CATALOG } from '@/lib/intelligence/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOG = [...SOCIAL_API_CATALOG, ...AUTOMATION_CATALOG];

/** Documentation registry and aggregate local account-state metadata; no provider calls are made. */
export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'Administrator login required.' }, { status: 401 });

  try {
    const accountRows = await db.integrationAccount.findMany({ select: { providerKey: true, verificationStatus: true } });
    const recordsByProvider = new Map<string, { recorded: number; configured: number }>();
    for (const row of accountRows) {
      const stats = recordsByProvider.get(row.providerKey) ?? { recorded: 0, configured: 0 };
      stats.recorded += 1;
      if (row.verificationStatus === 'CONFIGURED') stats.configured += 1;
      recordsByProvider.set(row.providerKey, stats);
    }

    return NextResponse.json({
      catalogVersion: '2026-11-15',
      liveProviderChecksPerformed: false,
      oauthAuthorizationsPerformed: false,
      accountVerificationPerformed: false,
      whatsappAuthorizationFlowAvailable: false,
      providers: CATALOG.map(provider => {
        const stats = recordsByProvider.get(provider.key) ?? { recorded: 0, configured: 0 };
        return {
          ...provider,
          recordedAccounts: stats.recorded,
          configuredAccounts: stats.configured,
          authorizedAccounts: 0,
          verifiedAccounts: 0,
          lastCheckedAt: null,
        };
      }),
      stateNote: 'Catalog and local records only. A recorded/configured entry is not proof of a provider grant, valid token, running service, or account access.',
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch {
    return NextResponse.json({ error: 'Integration registry is unavailable. Apply the reviewed additive database migrations and try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
