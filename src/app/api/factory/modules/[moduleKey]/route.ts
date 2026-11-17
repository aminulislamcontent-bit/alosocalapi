import { NextRequest, NextResponse } from 'next/server';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { getFirstPartyModule, type FirstPartyModuleKey } from '@/lib/factory/modules/registry';
import { executeSuiteModuleAction, getSuiteModuleState, updateModuleConfig } from '@/lib/factory/modules/suite-domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ moduleKey: string }> },
) {
  const { moduleKey } = await context.params;
  const mod = getFirstPartyModule(moduleKey);
  if (!mod) {
    return NextResponse.json({ error: `Unknown first-party module '${moduleKey}'.` }, { status: 404 });
  }

  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const state = await getSuiteModuleState(access.workspaceId, mod.key as FirstPartyModuleKey);
  return NextResponse.json(state);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ moduleKey: string }> },
) {
  const { moduleKey } = await context.params;
  const mod = getFirstPartyModule(moduleKey);
  if (!mod) {
    return NextResponse.json({ error: `Unknown first-party module '${moduleKey}'.` }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || 'create');
  const perm = action === 'approve' ? 'approve' : action === 'save_config' ? 'admin' : mod.requiredPermission;

  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: perm,
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  try {
    if (action === 'save_config') {
      const config = await updateModuleConfig({
        workspaceId: access.workspaceId,
        moduleKey: mod.key as FirstPartyModuleKey,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        adapterMode: body.adapterMode ? String(body.adapterMode) : undefined,
        config: body.config && typeof body.config === 'object' ? (body.config as Record<string, unknown>) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ config });
    }

    const result = await executeSuiteModuleAction({
      workspaceId: access.workspaceId,
      moduleKey: mod.key as FirstPartyModuleKey,
      action,
      title: body.title ? String(body.title) : undefined,
      recordId: body.recordId ? String(body.recordId) : undefined,
      language: body.language ? (String(body.language) as 'bn' | 'en' | 'hi' | 'ar' | 'es') : undefined,
      data: body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : body,
      actor: access.user.username,
      ip: access.ip,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Module action failed.' }, { status: 400 });
  }
}
