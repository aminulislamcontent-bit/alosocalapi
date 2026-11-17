import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/security/admin-guard';
import { runWebsiteBusinessDiscovery } from '@/lib/engineering/website-discovery';
import { prepareProviderEngineeringSetup } from '@/lib/engineering/credential-engineering';
import { generateRequiredCheckpointsForProvider } from '@/lib/engineering/verification-coordinator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req);
  if (!guard.ok) return guard.response;

  const projectId = req.nextUrl.searchParams.get('projectId');
  const projects = await db.integrationProject.findMany({
    where: projectId ? { id: projectId } : undefined,
    orderBy: { updatedAt: 'desc' },
    include: {
      discoveries: { orderBy: { createdAt: 'desc' }, take: 3 },
      credentials: { orderBy: { createdAt: 'desc' } },
      oauthApps: { orderBy: { createdAt: 'desc' } },
      checkpoints: { orderBy: { createdAt: 'desc' } },
      handovers: { orderBy: { exportedAt: 'desc' }, take: 5 },
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req, true);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'discover_website');

  try {
    if (action === 'discover_website') {
      const websiteUrl = String(body.websiteUrl || '').trim();
      if (!websiteUrl) return NextResponse.json({ error: 'websiteUrl is required.' }, { status: 400 });

      const out = await runWebsiteBusinessDiscovery({
        clientId: body.clientId ? String(body.clientId) : 'default-workspace',
        projectName: body.projectName ? String(body.projectName) : undefined,
        websiteUrl,
        htmlSnapshotFallback: body.htmlSnapshot ? String(body.htmlSnapshot) : undefined,
        allowLoopbackForTest: process.env.ALOAPI_ALLOW_TEST_LOOPBACK_DISCOVERY === 'true' && Boolean(body.allowLoopbackForTest),
        actor: guard.user.username,
        ip: guard.ip,
      });
      return NextResponse.json(out, { status: 201 });
    }

    if (action === 'prepare_providers') {
      const projectId = String(body.projectId || '').trim();
      const providerKeys = Array.isArray(body.providerKeys) ? (body.providerKeys as string[]) : [];
      if (!projectId || providerKeys.length === 0) {
        return NextResponse.json({ error: 'projectId and non-empty providerKeys array are required.' }, { status: 400 });
      }
      const prepared: { providerKey: string; oauthAppId: string; credentialsCount: number; checkpointsCount: number }[] = [];
      for (const pk of providerKeys.slice(0, 20)) {
        const res = await prepareProviderEngineeringSetup({
          projectId,
          providerKey: String(pk),
          publicBaseUrl: body.publicBaseUrl ? String(body.publicBaseUrl) : undefined,
          actor: guard.user.username,
          ip: guard.ip,
        });
        const checkpoints = await generateRequiredCheckpointsForProvider({
          projectId,
          providerKey: String(pk),
          actor: guard.user.username,
        });
        prepared.push({ providerKey: pk, oauthAppId: res.oauthApp.id, credentialsCount: res.credentials.length, checkpointsCount: checkpoints.length });
      }
      return NextResponse.json({ projectId, prepared });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Engineering project action failed.' }, { status: 400 });
  }
}
