import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  createFactoryWorkspace,
  requireFactoryAccess,
  upsertWorkspaceMember,
  type WorkspaceRole,
} from '@/lib/factory/tenancy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const [workspaces, members] = await Promise.all([
    db.factoryWorkspace.findMany({ orderBy: { createdAt: 'asc' } }),
    db.factoryWorkspaceMember.findMany({ where: { workspaceId: access.workspaceId }, orderBy: { createdAt: 'asc' } }),
  ]);

  return NextResponse.json({ activeWorkspaceId: access.workspaceId, role: access.role, workspaces, members });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'create_workspace');
  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: 'admin',
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  try {
    if (action === 'create_workspace') {
      const workspace = await createFactoryWorkspace({
        slug: String(body.slug || ''),
        name: String(body.name || ''),
        planTier: body.planTier ? (String(body.planTier) as 'free' | 'growth' | 'pro' | 'enterprise') : 'growth',
        timezone: body.timezone ? String(body.timezone) : 'Asia/Dhaka',
        defaultLanguage: body.defaultLanguage ? String(body.defaultLanguage) : 'en',
        ownerUsername: body.ownerUsername ? String(body.ownerUsername) : access.user.username,
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ workspace }, { status: 201 });
    }

    if (action === 'upsert_member') {
      const member = await upsertWorkspaceMember({
        workspaceId: access.workspaceId,
        username: String(body.username || ''),
        role: String(body.role || 'operator') as WorkspaceRole,
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ member });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Workspace operation failed.' }, { status: 400 });
  }
}
