import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { isSameOriginRequest } from '@/lib/security/request';
import { auditEvent } from '@/lib/security/audit';

export type WorkspaceRole = 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer';
export type FactoryPermission = 'read' | 'write' | 'execute' | 'approve' | 'admin';

const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly FactoryPermission[]> = {
  owner: ['read', 'write', 'execute', 'approve', 'admin'],
  admin: ['read', 'write', 'execute', 'approve', 'admin'],
  operator: ['read', 'write', 'execute'],
  analyst: ['read'],
  viewer: ['read'],
};

export function hasRolePermission(role: string, permission: FactoryPermission): boolean {
  const perms = ROLE_PERMISSIONS[role as WorkspaceRole];
  return perms ? perms.includes(permission) : false;
}

export async function ensureDefaultFactoryWorkspace(ownerUsername = 'admin') {
  return db.factoryWorkspace.upsert({
    where: { slug: 'default-workspace' },
    update: {},
    create: {
      id: 'default-workspace',
      slug: 'default-workspace',
      name: 'ALOAPI Default Factory Workspace',
      ownerUsername,
      planTier: 'growth',
      members: {
        create: {
          username: ownerUsername,
          role: 'owner',
          permissions: JSON.stringify(ROLE_PERMISSIONS.owner),
        },
      },
    },
  });
}

export async function createFactoryWorkspace(params: {
  slug: string;
  name: string;
  planTier?: 'free' | 'growth' | 'pro' | 'enterprise';
  timezone?: string;
  defaultLanguage?: string;
  ownerUsername?: string;
  actor: string;
  ip?: string;
}) {
  const slug = params.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || slug.length < 3) {
    throw new Error('Workspace slug must be at least 3 alphanumeric/hyphen characters.');
  }
  const existing = await db.factoryWorkspace.findUnique({ where: { slug } });
  if (existing) {
    throw new Error(`Workspace slug '${slug}' already exists.`);
  }
  const ownerUsername = (params.ownerUsername || params.actor || 'admin').trim();

  const clientAccountId =
    (await db.clientAccount.findUnique({ where: { username: ownerUsername }, select: { id: true } }))?.id ??
    null;
  const workspace = await db.factoryWorkspace.create({
    data: {
      slug,
      name: params.name.trim(),
      planTier: params.planTier || 'growth',
      status: 'active',
      ownerUsername,
      timezone: params.timezone || 'Asia/Dhaka',
      defaultLanguage: params.defaultLanguage || 'en',
      settings: '{}',
      members: {
        create: {
          username: ownerUsername,
          clientAccountId,
          role: 'owner',
          permissions: JSON.stringify(ROLE_PERMISSIONS.owner),
        },
      },
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.workspace.create',
    target: `${workspace.id}:${workspace.slug}`,
    ip: params.ip,
    metadata: { planTier: workspace.planTier, ownerUsername: workspace.ownerUsername },
  });

  return workspace;
}

export async function upsertWorkspaceMember(params: {
  workspaceId: string;
  username: string;
  role: WorkspaceRole;
  actor: string;
  ip?: string;
}) {
  if (!ROLE_PERMISSIONS[params.role]) {
    throw new Error(`Unsupported workspace role: ${params.role}`);
  }
  const ws = await db.factoryWorkspace.findUnique({ where: { id: params.workspaceId } });
  if (!ws) throw new Error('Workspace not found.');

  const clientAccountId =
    (await db.clientAccount.findUnique({ where: { username: params.username.trim() }, select: { id: true } }))
      ?.id ?? null;
  const member = await db.factoryWorkspaceMember.upsert({
    where: { workspaceId_username: { workspaceId: params.workspaceId, username: params.username.trim() } },
    update: {
      clientAccountId,
      role: params.role,
      permissions: JSON.stringify(ROLE_PERMISSIONS[params.role]),
      status: 'active',
    },
    create: {
      workspaceId: params.workspaceId,
      username: params.username.trim(),
      clientAccountId,
      role: params.role,
      permissions: JSON.stringify(ROLE_PERMISSIONS[params.role]),
      status: 'active',
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.workspace.member.upsert',
    target: `${params.workspaceId}:${member.username}`,
    ip: params.ip,
    metadata: { role: params.role },
  });

  return member;
}

export async function resolveWorkspaceId(requestedId?: string | null): Promise<string> {
  const candidate = requestedId?.trim() || 'default-workspace';
  const found = await db.factoryWorkspace.findFirst({
    where: { OR: [{ id: candidate }, { slug: candidate }] },
    select: { id: true, status: true },
  });
  if (!found) {
    throw new Error(`Workspace '${candidate}' does not exist.`);
  }
  if (found.status !== 'active') {
    throw new Error(`Workspace '${candidate}' is suspended or inactive.`);
  }
  return found.id;
}

export async function requireFactoryAccess(
  req: NextRequest,
  opts: {
    workspaceId?: string | null;
    permission?: FactoryPermission;
    requireCsrf?: boolean;
  } = {},
): Promise<
  | {
      ok: true;
      user: SessionUser & { username: string };
      workspaceId: string;
      role: WorkspaceRole;
      ip: string;
    }
  | { ok: false; response: NextResponse }
> {
  if (opts.requireCsrf && !isSameOriginRequest(req)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 }),
    };
  }

  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }),
    };
  }

  const username = user.username || (user.role === 'admin' ? 'admin' : user.clientId || 'user');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const requiredPerm: FactoryPermission = opts.permission ?? 'read';

  let workspaceId: string;
  try {
    workspaceId = await resolveWorkspaceId(opts.workspaceId);
  } catch (err) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: user.role === 'admin' && err instanceof Error ? err.message : 'Forbidden.' },
        { status: user.role === 'admin' ? 404 : 403 },
      ),
    };
  }

  // Master portal admin retains owner-level access across workspaces; workspace members are checked against DB RBAC
  if (user.role === 'admin') {
    const member = await db.factoryWorkspaceMember.findUnique({
      where: { workspaceId_username: { workspaceId, username } },
    });
    const role: WorkspaceRole = (member?.role as WorkspaceRole) || 'owner';
    if (!hasRolePermission(role, requiredPerm)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Insufficient workspace permission (${requiredPerm}) for role ${role}.` },
          { status: 403 },
        ),
      };
    }
    return { ok: true, user: { ...user, username }, workspaceId, role, ip };
  }

  // Client portal users are strictly isolated to workspaces where they hold active membership matching tenant rules
  const member = await db.factoryWorkspaceMember.findUnique({
    where: { workspaceId_username: { workspaceId, username } },
  });
  if (!member || member.status !== 'active' || !user.clientId || member.clientAccountId !== user.clientId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden: no active workspace membership.' }, { status: 403 }),
    };
  }

  const role = member.role as WorkspaceRole;
  if (!hasRolePermission(role, requiredPerm)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: role '${role}' lacks '${requiredPerm}' permission.` },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user: { ...user, username }, workspaceId, role, ip };
}

export function listVisibleWorkspaces(user: SessionUser) {
  if (user.role !== 'admin' && !user.clientId) throw new Error('Missing authenticated client identity.');
  return db.factoryWorkspace.findMany({
    where:
      user.role === 'admin'
        ? {}
        : {
            status: 'active',
            members: { some: { clientAccountId: user.clientId, username: user.username, status: 'active' } },
          },
    orderBy: { createdAt: 'asc' },
  });
}
