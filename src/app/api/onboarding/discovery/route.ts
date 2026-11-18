import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { discoverProviderAccounts, generateApiDiscoverySnapshot, runLiveReadOnlyVerification } from '@/lib/onboarding/api-discovery';
import { dispatchOmniEvent } from '@/lib/onboarding/omni-routing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const providerKey = req.nextUrl.searchParams.get('providerKey') || undefined;
  const snapshots = await db.apiDiscoverySnapshot.findMany({
    where: providerKey ? { providerKey } : undefined,
    orderBy: { checkedAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ snapshots });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'discover');
  const providerKey = String(body.providerKey || '').trim();
  if (!providerKey) return NextResponse.json({ error: 'providerKey is required.' }, { status: 400 });

  try {
    if (action === 'discover') {
      const result = await generateApiDiscoverySnapshot({
        providerKey,
        externalDocExcerpt: body.externalDocExcerpt ? String(body.externalDocExcerpt) : undefined,
        actor: guard.user.username,
      });
      return NextResponse.json(result);
    }

    if (action === 'discover_accounts') {
      const tenantId = String(body.tenantId || '').trim();
      if (!tenantId) return NextResponse.json({ error: 'tenantId is required for provider account discovery.' }, { status: 400 });
      const result = await discoverProviderAccounts({
        tenantId,
        providerKey,
        actor: guard.user.username,
        ip: guard.ip,
        identityValue: body.identityValue ? String(body.identityValue) : undefined,
      });
      return NextResponse.json({ discovery: result });
    }

    if (action === 'verify_live') {
      const tenantId = String(body.tenantId || '').trim();
      if (!tenantId) return NextResponse.json({ error: 'tenantId is required for live verification.' }, { status: 400 });
      const probe = await runLiveReadOnlyVerification({
        tenantId,
        providerKey,
        actor: guard.user.username,
      });
      await dispatchOmniEvent({
        tenantId,
        eventType: probe.verified ? 'api.verified' : 'api.failed',
        providerKey,
        sourceChannel: 'live_verification_probe',
        payload: {
          status: probe.status,
          httpStatus: probe.httpStatus,
          executed: probe.executed,
          reason: probe.message,
        },
        actor: guard.user.username,
      }).catch(() => undefined);

      return NextResponse.json({ verification: probe });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Discovery operation failed.' }, { status: 400 });
  }
}
