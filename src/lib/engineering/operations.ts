import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';

// Engineering scopes are the clientId (tenant) and IntegrationProject.id (project workspace).
const operations = [
  {
    provider: 'sendgrid_api',
    action: 'publish_campaign_broadcast',
    method: 'POST',
    impact: 'HIGH_IMPACT_ACTION',
    permission: 'admin',
    approval: 'single_use_owner',
    reversible: false,
    confirm: true,
    schema: z.object({ campaignId: z.string().regex(/^\d{1,20}$/) }).strict(),
    path: (p: Record<string, unknown>) => `campaigns/${p.campaignId}/schedules/now`,
  },
  {
    provider: 'sendgrid_api',
    action: 'read_sender_status',
    method: 'GET',
    impact: 'READ_ONLY',
    permission: 'admin',
    approval: 'none',
    reversible: true,
    confirm: false,
    schema: z.object({}).strict(),
    path: () => 'verified_senders',
  },
] as const;
export function operationFor(provider: string, action: string, payload: unknown) {
  const op = operations.find((o) => o.provider === provider && o.action === action);
  if (!op) throw new Error('Unregistered provider operation.');
  const parsed = op.schema.safeParse(payload ?? {});
  if (!parsed.success) throw new Error('Invalid operation payload.');
  return {
    op,
    path: op.path(parsed.data),
    digest: createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'),
  };
}
export async function approveOperation(
  projectId: string,
  providerKey: string,
  action: string,
  payload: unknown,
  adminId: string,
) {
  const { op, digest } = operationFor(providerKey, action, payload);
  const project = await db.integrationProject.findUniqueOrThrow({ where: { id: projectId } });
  if (
    !op.confirm ||
    !adminId ||
    !(await db.adminUser.findUnique({ where: { id: adminId }, select: { id: true } }))
  )
    throw new Error('Administrator approval required.');
  return db.operationApproval.create({
    data: {
      projectId,
      tenantId: project.clientId,
      adminId,
      providerKey,
      action,
      digest,
      expiresAt: new Date(Date.now() + 300000),
    },
    select: { id: true, expiresAt: true },
  });
}
