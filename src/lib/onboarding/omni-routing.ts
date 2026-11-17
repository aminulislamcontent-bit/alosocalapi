import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import {
  canTransitionWorkflowState,
  getOrCreateWorkflow,
  isValidOnboardingState,
  transitionWorkflowState,
  type OnboardingState,
} from './state-machine';
import { redactSecretObject, redactSecretText } from './vault-service';
import { auditEvent } from '@/lib/security/audit';

export const ALLOWED_OMNI_EVENTS = [
  'client.onboarded',
  'account.created',
  'oauth.authorized',
  'credential.stored',
  'credential.expiring',
  'api.verified',
  'api.failed',
  'webhook.received',
  'lead.captured',
  'campaign.event',
  'export.generated',
  'integrity.alert',
] as const;

export const ALLOWED_EVENT_SOURCES = [
  'cli',
  'admin_console',
  'requirements_engine',
  'browser_orchestrator',
  'oauth_callback',
  'oauth_redirect_callback',
  'vault_api',
  'live_verification_probe',
  'webhook_verifier',
  'export_api',
  'background_job',
  'file_integrity',
  'post_login_init',
  'provider_webhook',
  'whatsapp',
  'telegram',
] as const;

export type OmniEventType = (typeof ALLOWED_OMNI_EVENTS)[number];

export interface DispatchOmniEventInput {
  tenantId: string;
  eventType: OmniEventType;
  providerKey?: string;
  sourceChannel: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  correlationId?: string;
  maxAttempts?: number;
  actor: string;
}

export function validateOmniEventInput(input: {
  eventType: string;
  tenantId: string;
  sourceChannel: string;
  payload: unknown;
}): { ok: boolean; error?: string } {
  if (!(ALLOWED_OMNI_EVENTS as readonly string[]).includes(input.eventType)) {
    return { ok: false, error: `Unsupported eventType: ${input.eventType}` };
  }
  if (!input.tenantId || typeof input.tenantId !== 'string') {
    return { ok: false, error: 'tenantId is required.' };
  }
  if (!input.sourceChannel || typeof input.sourceChannel !== 'string' || !(ALLOWED_EVENT_SOURCES as readonly string[]).includes(input.sourceChannel)) {
    return { ok: false, error: `Unauthorized or unsupported event sourceChannel: ${String(input.sourceChannel || 'empty')}` };
  }
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    return { ok: false, error: 'payload must be a JSON object.' };
  }
  const serialized = JSON.stringify(input.payload);
  if (serialized.length > 64_000) {
    return { ok: false, error: 'Event payload exceeds maximum 64KB size.' };
  }
  return { ok: true };
}

function computeIdempotencyKey(input: DispatchOmniEventInput): string {
  if (input.idempotencyKey && input.idempotencyKey.trim()) {
    return input.idempotencyKey.trim();
  }
  return createHash('sha256')
    .update(JSON.stringify({
      tenantId: input.tenantId,
      eventType: input.eventType,
      providerKey: input.providerKey ?? null,
      sourceChannel: input.sourceChannel,
      payload: input.payload,
    }))
    .digest('hex');
}

async function routeValidatedEvent(eventId: string, input: DispatchOmniEventInput, correlationId: string): Promise<string> {
  if (input.payload.simulateTransientFailure === true) {
    throw new Error('Simulated transient downstream delivery error.');
  }

  switch (input.eventType) {
    case 'oauth.authorized':
      if (input.providerKey) {
        const wf = await getOrCreateWorkflow({ tenantId: input.tenantId, providerKey: input.providerKey, correlationId });
        const cur = (isValidOnboardingState(wf.state) ? wf.state : 'NOT_STARTED') as OnboardingState;
        if (canTransitionWorkflowState(cur, 'AUTHORIZED')) {
          await transitionWorkflowState({
            workflowId: wf.id,
            nextState: 'AUTHORIZED',
            actor: input.actor,
            reason: 'Omni-routing processed official OAuth authorization event.',
            correlationId,
          });
        }
      }
      return 'workflow.transitioned.authorized';
    case 'api.verified':
      if (input.providerKey) {
        const wf = await getOrCreateWorkflow({ tenantId: input.tenantId, providerKey: input.providerKey, correlationId });
        const cur = (isValidOnboardingState(wf.state) ? wf.state : 'NOT_STARTED') as OnboardingState;
        if (canTransitionWorkflowState(cur, 'VERIFIED')) {
          await transitionWorkflowState({
            workflowId: wf.id,
            nextState: 'VERIFIED',
            actor: input.actor,
            reason: 'Omni-routing processed live read-only API verification event.',
            correlationId,
          });
        }
      }
      return 'workflow.transitioned.verified';
    case 'api.failed':
      if (input.providerKey) {
        const wf = await getOrCreateWorkflow({ tenantId: input.tenantId, providerKey: input.providerKey, correlationId });
        const cur = (isValidOnboardingState(wf.state) ? wf.state : 'NOT_STARTED') as OnboardingState;
        if (canTransitionWorkflowState(cur, 'FAILED')) {
          await transitionWorkflowState({
            workflowId: wf.id,
            nextState: 'FAILED',
            actor: input.actor,
            reason: 'Omni-routing processed API failure alert.',
            lastError: redactSecretText(String(input.payload.reason || 'API probe failed')),
            correlationId,
          });
        }
      }
      return 'workflow.transitioned.failed';
    case 'account.created':
      if (input.providerKey) {
        const wf = await getOrCreateWorkflow({ tenantId: input.tenantId, providerKey: input.providerKey, correlationId });
        const cur = (isValidOnboardingState(wf.state) ? wf.state : 'NOT_STARTED') as OnboardingState;
        if (canTransitionWorkflowState(cur, 'ACCOUNT_CREATED')) {
          await transitionWorkflowState({
            workflowId: wf.id,
            nextState: 'ACCOUNT_CREATED',
            actor: input.actor,
            reason: 'Omni-routing processed account creation confirmation.',
            correlationId,
          });
        }
      }
      return 'workflow.transitioned.account_created';
    default:
      await auditEvent({
        actor: input.actor,
        action: `omni.event.${input.eventType}`,
        target: `${input.tenantId}:${input.providerKey ?? input.sourceChannel}`,
        providerKey: input.providerKey,
        metadata: { eventId, correlationId },
      });
      return `event.audited.${input.eventType}`;
  }
}

export async function dispatchOmniEvent(input: DispatchOmniEventInput) {
  const valid = validateOmniEventInput(input);
  if (!valid.ok) throw new Error(valid.error);

  const idempotencyKey = computeIdempotencyKey(input);
  const existing = await db.omniEvent.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { deduplicated: true, event: existing };
  }

  const correlationId = input.correlationId || `evt_${randomUUID()}`;
  const redactedPayload = redactSecretObject(input.payload);
  const maxAttempts = Math.min(5, Math.max(1, input.maxAttempts ?? 3));

  const created = await db.omniEvent.create({
    data: {
      clientId: input.tenantId,
      eventType: input.eventType,
      eventName: input.eventType,
      providerKey: input.providerKey ?? null,
      source: input.sourceChannel,
      idempotencyKey,
      correlationId,
      payload: JSON.stringify(redactedPayload),
      status: 'queued',
      attempts: 0,
      maxAttempts,
    },
  });

  try {
    const route = await routeValidatedEvent(created.id, input, correlationId);
    const completed = await db.omniEvent.update({
      where: { id: created.id },
      data: {
        status: 'COMPLETED',
        attempts: 1,
        eventName: `${input.eventType} -> ${route}`,
        processedAt: new Date(),
      },
    });
    return { deduplicated: false, event: completed };
  } catch (err) {
    const msg = redactSecretText(err instanceof Error ? err.message : 'Routing failed');
    const attempts = 1;
    const isDeadLetter = attempts >= maxAttempts;
    const nextAttemptAt = isDeadLetter ? null : new Date(Date.now() + 30_000);
    const updated = await db.omniEvent.update({
      where: { id: created.id },
      data: {
        status: isDeadLetter ? 'DEAD_LETTER' : 'RETRY_SCHEDULED',
        attempts,
        lastError: msg,
        nextAttemptAt,
      },
    });
    return { deduplicated: false, event: updated };
  }
}

export async function retryOrDeadLetterEvent(eventId: string, actor: string) {
  const row = await db.omniEvent.findUnique({ where: { id: eventId } });
  if (!row) throw new Error('OmniEvent not found.');

  const payload = (() => {
    try { return JSON.parse(row.payload) as Record<string, unknown>; } catch { return {}; }
  })();
  const replayPayload = { ...payload };
  delete replayPayload.simulateTransientFailure;

  const attempt = row.attempts + 1;
  try {
    const route = await routeValidatedEvent(
      row.id,
      {
        tenantId: row.clientId || 'workspace',
        eventType: row.eventType as OmniEventType,
        providerKey: row.providerKey ?? undefined,
        sourceChannel: row.source,
        payload: replayPayload,
        actor,
      },
      row.correlationId,
    );
    return db.omniEvent.update({
      where: { id: row.id },
      data: {
        status: 'COMPLETED',
        attempts: attempt,
        eventName: `${row.eventType} -> ${route}`,
        lastError: null,
        processedAt: new Date(),
      },
    });
  } catch (err) {
    const msg = redactSecretText(err instanceof Error ? err.message : 'Retry failed');
    const isDead = attempt >= row.maxAttempts;
    return db.omniEvent.update({
      where: { id: row.id },
      data: {
        status: isDead ? 'DEAD_LETTER' : 'RETRY_SCHEDULED',
        attempts: attempt,
        lastError: msg,
        nextAttemptAt: isDead ? null : new Date(Date.now() + attempt * 30_000),
      },
    });
  }
}

export async function cancelOmniEvent(eventId: string, reason: string, actor: string) {
  const row = await db.omniEvent.findUnique({ where: { id: eventId } });
  if (!row) throw new Error('OmniEvent not found.');
  if (row.status === 'COMPLETED') {
    throw new Error('Completed events cannot be cancelled.');
  }
  const updated = await db.omniEvent.update({
    where: { id: row.id },
    data: {
      status: 'CANCELLED',
      nextAttemptAt: null,
      lastError: redactSecretText(reason || 'Cancelled by administrator'),
    },
  });
  await auditEvent({
    actor,
    action: 'omni.event.cancelled',
    target: `${row.clientId || 'workspace'}:${row.id}`,
    providerKey: row.providerKey ?? undefined,
    metadata: { eventId: row.id, correlationId: row.correlationId, reason: redactSecretText(reason) },
  });
  return updated;
}
