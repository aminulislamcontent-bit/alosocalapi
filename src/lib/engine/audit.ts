import { db } from '@/lib/db';

// ─── Immutable audit trail (§14) ────────────────────────────────────

export interface AuditInput {
  clientId?: string | null;
  actor: string;
  actorRole: string; // admin | client | system
  action: string; // e.g. campaign.create, lead.status_change
  resource: string; // e.g. acquisition_campaign
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  justification?: string | null;
  ip?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      clientId: input.clientId ?? null,
      actor: input.actor,
      actorRole: input.actorRole,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      before: input.before !== undefined ? safeJson(input.before) : null,
      after: input.after !== undefined ? safeJson(input.after) : null,
      justification: input.justification ?? null,
      ip: input.ip ?? null,
    },
  });
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export async function getAuditTrail(opts: {
  clientId?: string | null;
  action?: string;
  limit?: number;
}) {
  return db.auditEvent.findMany({
    where: {
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      ...(opts.action ? { action: opts.action } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 100, 500),
  });
}
