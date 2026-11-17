import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import {
  buildProviderAdapterProfile,
  executeProviderAdapterLifecycle,
  listAllUniversalAdapters,
  type AdapterLifecycleOperation,
} from '@/lib/engineering/provider-adapters';
import { prepareProviderEngineeringSetup } from '@/lib/engineering/credential-engineering';
import { executeAuthorizedClientApiAction } from '@/lib/engineering/client-api-executor';
import { buildProviderCompletionMatrix } from '@/lib/engineering/handover-packager';
import { runLiveReadOnlyVerification } from '@/lib/onboarding/api-discovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const format = req.nextUrl.searchParams.get('format');
  if (format === 'matrix') {
    const projectId = req.nextUrl.searchParams.get('projectId') || undefined;
    const matrix = await buildProviderCompletionMatrix(projectId);
    return NextResponse.json(matrix);
  }

  const providerKey = req.nextUrl.searchParams.get('providerKey');
  const category = req.nextUrl.searchParams.get('category') || undefined;
  const publicBaseUrl = req.nextUrl.searchParams.get('publicBaseUrl') || undefined;

  if (providerKey) {
    try {
      const adapter = buildProviderAdapterProfile(providerKey, { publicBaseUrl });
      return NextResponse.json({ adapter });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown provider' }, { status: 404 });
    }
  }

  const adapters = listAllUniversalAdapters({ category, publicBaseUrl });
  return NextResponse.json({ total: adapters.length, adapters });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'prepare_provider');
  const projectId = String(body.projectId || '').trim();
  const providerKey = String(body.providerKey || '').trim();
  if (!projectId || !providerKey) {
    return NextResponse.json({ error: 'projectId and providerKey are required.' }, { status: 400 });
  }

  try {
    if (action === 'prepare_provider') {
      const result = await prepareProviderEngineeringSetup({
        projectId,
        providerKey,
        publicBaseUrl: body.publicBaseUrl ? String(body.publicBaseUrl) : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(result);
    }

    if (action === 'test_connection') {
      const project = await db.integrationProject.findUnique({ where: { id: projectId } });
      if (!project) return NextResponse.json({ error: 'IntegrationProject not found.' }, { status: 404 });

      const probe = await runLiveReadOnlyVerification({
        tenantId: project.clientId,
        providerKey,
        actor: guard.user.username,
      });

      const nextStatus = probe.verified
        ? 'VERIFIED'
        : probe.status === 'OWNER_ACTION_REQUIRED'
          ? 'CLIENT_ACTIVATION_REQUIRED'
          : 'CONFIGURED';

      await db.oAuthAppRegistryEntry.updateMany({
        where: { projectId, providerKey },
        data: { verificationStatus: nextStatus },
      });

      return NextResponse.json({ probe, updatedVerificationStatus: nextStatus });
    }

    if (action === 'adapter_lifecycle') {
      const project = await db.integrationProject.findUnique({ where: { id: projectId } });
      if (!project) return NextResponse.json({ error: 'IntegrationProject not found.' }, { status: 404 });
      const op = String(body.operation || 'account_discovery') as AdapterLifecycleOperation;
      const out = await executeProviderAdapterLifecycle({
        operation: op,
        providerKey,
        tenantId: project.clientId,
        projectId,
        redirectUri: body.redirectUri ? String(body.redirectUri) : undefined,
        payloadRaw: body.payloadRaw ? String(body.payloadRaw) : undefined,
        signatureHeader: body.signatureHeader ? String(body.signatureHeader) : undefined,
        actor: guard.user.username,
      });
      return NextResponse.json(out);
    }

    if (action === 'execute_client_api') {
      const execResult = await executeAuthorizedClientApiAction({
        projectId,
        providerKey,
        actionName: String(body.actionName || 'read_status'),
        httpMethod: (body.httpMethod ? String(body.httpMethod).toUpperCase() : 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        endpointPath: body.endpointPath ? String(body.endpointPath) : undefined,
        bodyPayload: body.bodyPayload && typeof body.bodyPayload === 'object' ? (body.bodyPayload as Record<string, unknown>) : undefined,
        requestedImpactLevel: body.impactLevel as 'READ_ONLY' | 'LOW_IMPACT_WRITE' | 'HIGH_IMPACT_ACTION' | undefined,
        ownerApprovalGranted: Boolean(body.ownerApprovalGranted),
        approvalCheckpointId: body.approvalCheckpointId ? String(body.approvalCheckpointId) : undefined,
        approvalReference: body.approvalReference ? String(body.approvalReference) : undefined,
        allowLoopbackForTest: process.env.ALOAPI_ALLOW_TEST_LOOPBACK_EXECUTION === 'true' && Boolean(body.allowLoopbackForTest),
        testEndpointOverride: body.testEndpointOverride ? String(body.testEndpointOverride) : undefined,
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(execResult, {
        status: execResult.status === 'APPROVAL_REQUIRED' ? 403 : 200,
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Provider action failed.' }, { status: 400 });
  }
}
