import { db } from '@/lib/db';

export async function auditEvent(params: {
  actor: string;
  action: string;
  target?: string;
  ip?: string;
  providerKey?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}) {
  const detailObj = {
    ...(params.target ? { target: params.target } : {}),
    ...(params.ip ? { ip: params.ip } : {}),
    ...(params.metadata ?? {}),
  };
  await db.integrationAuditEvent.create({
    data: {
      actor: params.actor,
      action: params.action,
      providerKey: params.providerKey ?? null,
      accountId: params.accountId ?? null,
      detail: JSON.stringify(detailObj).slice(0, 2000),
    },
  }).catch(() => undefined);
}
