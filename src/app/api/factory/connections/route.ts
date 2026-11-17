import { NextRequest, NextResponse } from 'next/server';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import {
  connectExternalProviderToModule,
  disconnectExternalProviderFromModule,
  listFactoryProviderConnections,
} from '@/lib/factory/provider-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const moduleKey = req.nextUrl.searchParams.get('moduleKey') || undefined;
  const connections = await listFactoryProviderConnections(access.workspaceId, moduleKey);
  return NextResponse.json({ workspaceId: access.workspaceId, connections });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: 'approve',
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  const action = String(body.action || 'connect');
  try {
    if (action === 'connect') {
      const connection = await connectExternalProviderToModule({
        workspaceId: access.workspaceId,
        moduleKey: String(body.moduleKey || ''),
        providerKey: String(body.providerKey || ''),
        scopes: Array.isArray(body.scopes) ? (body.scopes as string[]) : undefined,
        configMeta: body.configMeta && typeof body.configMeta === 'object' ? (body.configMeta as Record<string, unknown>) : undefined,
        approvedBy: access.user.username,
        explicitOwnerConsent: Boolean(body.explicitOwnerConsent),
        ip: access.ip,
      });
      return NextResponse.json({ connection });
    }

    if (action === 'disconnect') {
      const connection = await disconnectExternalProviderFromModule({
        workspaceId: access.workspaceId,
        moduleKey: String(body.moduleKey || ''),
        providerKey: String(body.providerKey || ''),
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ connection });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Connection operation failed.' }, { status: 400 });
  }
}
