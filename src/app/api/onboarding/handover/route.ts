import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { buildIntegrationHandoverPackage, type IntegrationIdentityInput } from '@/lib/onboarding/handover-package';
import { generateApiDiscoverySnapshot, runLiveReadOnlyVerification } from '@/lib/onboarding/api-discovery';
import { startBrowserWorkflowSession } from '@/lib/onboarding/browser-orchestrator';
import { auditEvent } from '@/lib/security/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BrowserSessionSummary = {
  id: string;
  officialUrl: string;
  status: string;
  executionMode: 'isolated_browser' | 'guided_official_handoff';
  note: string;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const tenantId = String(body.tenantId || '').trim();
  const providerKey = String(body.providerKey || '').trim();
  const kind = String(body.identityKind || '').trim();
  const value = String(body.identityValue || '').trim();
  if (!tenantId || !providerKey || !value || !['url', 'phone', 'account'].includes(kind)) {
    return NextResponse.json({ error: 'tenantId, providerKey, identityKind (url|phone|account), and identityValue are required.' }, { status: 400 });
  }

  try {
    const identity: IntegrationIdentityInput = { kind: kind as IntegrationIdentityInput['kind'], value };
    const handover = await buildIntegrationHandoverPackage({ tenantId, providerKey, identity, actor: guard.user.username });
    const discovery = await generateApiDiscoverySnapshot({ providerKey, actor: guard.user.username });
    let browserSession: { id: string; officialUrl: string; status: string; executionMode: string; note: string } | null = null;
    if (body.startOfficialPortal === true) {
      const session = await startBrowserWorkflowSession({
        tenantId,
        providerKey,
        workflowType: 'developer_portal',
        ownerEmail: String(body.ownerEmail || ''),
        actor: guard.user.username,
        ip: guard.ip,
      });
      browserSession = {
        id: session.session.id,
        officialUrl: session.session.officialUrl,
        status: session.session.status,
        executionMode: session.runtime.executionMode,
        note: 'This creates a supervised portal checkpoint. It does not automate login or claim that provider app creation has completed.',
      };
    }
    // Step 8 of the handover contract: an explicit, least-privilege, read-only
    // probe that reports the real result. It never marks an integration VERIFIED
    // on its own and never substitutes a saved credential for a live API check.
    if (body.runLiveProbe === true) {
      liveVerification = await runLiveReadOnlyVerification({
        tenantId,
        providerKey,
        actor: guard.user.username,
      });
    }

    await auditEvent({
      actor: guard.user.username,
      action: 'onboarding.handover.package.generated',
      target: `${tenantId}:${providerKey}`,
      providerKey,
      ip: guard.ip,
      metadata: { identityKind: kind, discoverySnapshotId: discovery.snapshot.id, browserSessionId: browserSession?.id ?? null, liveProbeStatus: liveVerification?.status ?? null },
    });
    return NextResponse.json({
      handover,
      discovery: { snapshotId: discovery.snapshot.id, docHash: discovery.snapshot.docHash, fetchStatus: discovery.snapshot.fetchStatus },
      browserSession,
      liveVerification,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to generate integration handover package.' }, { status: 400 });
  }
}
