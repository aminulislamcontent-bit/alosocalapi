import { NextRequest, NextResponse } from 'next/server';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { buildFactoryWorkspaceSnapshot, restoreFactoryWorkspaceModuleConfigs } from '@/lib/factory/portability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  try {
    const bundle = await buildFactoryWorkspaceSnapshot(access.workspaceId, access.user.username);
    return NextResponse.json(bundle, {
      headers: {
        'X-ALOAPI-Secrets-Included': 'false',
        'X-ALOAPI-Backup-SHA256': bundle.sha256,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed.' }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: 'admin',
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  try {
    const snapshot = body.snapshot && typeof body.snapshot === 'object' ? (body.snapshot as Record<string, unknown>) : null;
    if (!snapshot) return NextResponse.json({ error: 'snapshot object is required.' }, { status: 400 });
    const res = await restoreFactoryWorkspaceModuleConfigs({
      workspaceId: access.workspaceId,
      snapshot,
      actor: access.user.username,
    });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Restore failed.' }, { status: 400 });
  }
}
