import { createHash, randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { resolveVaultSecretForServer, redactSecretText } from '@/lib/onboarding/vault-service';
import { auditEvent } from '@/lib/security/audit';

export type ApiActionImpactLevel = 'READ_ONLY' | 'LOW_IMPACT_WRITE' | 'HIGH_IMPACT_ACTION';

export interface NormalizedProviderApiError {
  code:
    | 'RATE_LIMITED'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'UPSTREAM_TRANSIENT'
    | 'UPSTREAM_ERROR'
    | 'NETWORK_ERROR'
    | 'VALIDATION_ERROR';
  retryable: boolean;
  httpStatus: number | null;
  rateLimitResetAt: string | null;
  message: string;
}

const HIGH_IMPACT_PATTERN =
  /(?:^|_|-)(publish|send|broadcast|spend|billing|charge|invoice|delete|destroy|remove|revoke|permission|role|transfer|dns|webhook_mutate|payout|ad_launch)(?:$|_|-)/i;

export function classifyApiActionImpact(params: {
  actionName: string;
  httpMethod?: string;
  requestedImpactLevel?: ApiActionImpactLevel;
}): ApiActionImpactLevel {
  if (params.requestedImpactLevel === 'HIGH_IMPACT_ACTION') return 'HIGH_IMPACT_ACTION';
  const method = (params.httpMethod || 'GET').toUpperCase();
  if (method === 'DELETE' || HIGH_IMPACT_PATTERN.test(params.actionName)) {
    return 'HIGH_IMPACT_ACTION';
  }
  if (method === 'GET' || method === 'HEAD') return 'READ_ONLY';
  return params.requestedImpactLevel || 'LOW_IMPACT_WRITE';
}

export function normalizeProviderApiError(params: {
  httpStatus: number | null;
  rawBody?: string;
  retryAfterHeader?: string | null;
  fallbackMessage?: string;
}): NormalizedProviderApiError {
  const status = params.httpStatus;
  const msg = redactSecretText(params.fallbackMessage || params.rawBody || 'Provider API request failed').slice(0, 300);
  if (status === null) {
    return { code: 'NETWORK_ERROR', retryable: true, httpStatus: null, rateLimitResetAt: null, message: msg };
  }
  if (status === 429) {
    const sec = Number(params.retryAfterHeader || '1');
    const resetMs = Number.isFinite(sec) && sec > 0 ? Math.min(sec, 3600) * 1000 : 1000;
    return {
      code: 'RATE_LIMITED',
      retryable: true,
      httpStatus: 429,
      rateLimitResetAt: new Date(Date.now() + resetMs).toISOString(),
      message: msg,
    };
  }
  if (status === 401) return { code: 'UNAUTHORIZED', retryable: false, httpStatus: 401, rateLimitResetAt: null, message: msg };
  if (status === 403) return { code: 'FORBIDDEN', retryable: false, httpStatus: 403, rateLimitResetAt: null, message: msg };
  if (status === 404) return { code: 'NOT_FOUND', retryable: false, httpStatus: 404, rateLimitResetAt: null, message: msg };
  if (status >= 500 && status <= 504) {
    return { code: 'UPSTREAM_TRANSIENT', retryable: true, httpStatus: status, rateLimitResetAt: null, message: msg };
  }
  if (status >= 400 && status < 500) {
    return { code: 'VALIDATION_ERROR', retryable: false, httpStatus: status, rateLimitResetAt: null, message: msg };
  }
  return { code: 'UPSTREAM_ERROR', retryable: false, httpStatus: status, rateLimitResetAt: null, message: msg };
}

function validateTargetEndpointUrl(urlStr: string, allowedBaseUrls: string[], allowLoopbackForTest: boolean): URL {
  const parsed = new URL(urlStr);
  if (allowLoopbackForTest && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')) {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Test loopback endpoint must use HTTP or HTTPS.');
    }
    return parsed;
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Client API execution requires official HTTPS endpoints.');
  }
  const allowedHosts = allowedBaseUrls
    .map(b => {
      try {
        return new URL(b).hostname.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const host = parsed.hostname.toLowerCase();
  const hostMatches = allowedHosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  if (!hostMatches) {
    throw new Error(`Endpoint host "${host}" is not registered under provider official apiBaseUrls.`);
  }
  return parsed;
}

export interface ClientApiExecutionResult {
  status: 'EXECUTED' | 'APPROVAL_REQUIRED' | 'CLIENT_ACTIVATION_REQUIRED' | 'FAILED';
  impactLevel: ApiActionImpactLevel;
  approvalRequired: boolean;
  approvalSatisfied: boolean;
  providerKey: string;
  actionName: string;
  httpMethod: string;
  endpointUrl: string;
  httpStatus: number | null;
  attempts: number;
  idempotencyKey: string;
  deduplicatedReplay: boolean;
  responsePreview: string | null;
  normalizedError: NormalizedProviderApiError | null;
  runId: string;
  reason: string;
}

export async function executeAuthorizedClientApiAction(params: {
  projectId: string;
  providerKey: string;
  actionName: string;
  httpMethod?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpointPath?: string;
  bodyPayload?: Record<string, unknown>;
  requestedImpactLevel?: ApiActionImpactLevel;
  ownerApprovalGranted?: boolean;
  approvalCheckpointId?: string;
  approvalReference?: string;
  idempotencyKey?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  allowLoopbackForTest?: boolean;
  testEndpointOverride?: string;
  actor: string;
  ip?: string;
}): Promise<ClientApiExecutionResult> {
  const project = await db.integrationProject.findUnique({ where: { id: params.projectId } });
  if (!project) throw new Error('IntegrationProject not found.');

  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error(`Unknown provider: ${params.providerKey}`);

  const method = (params.httpMethod || 'GET').toUpperCase() as 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const impactLevel = classifyApiActionImpact({
    actionName: params.actionName,
    httpMethod: method,
    requestedImpactLevel: params.requestedImpactLevel,
  });

  const correlationId = `exec_${randomUUID()}`;
  const idempotencyKey =
    params.idempotencyKey?.trim() ||
    `idem_${createHash('sha256').update(`${project.id}:${provider.key}:${params.actionName}:${correlationId}`).digest('hex').slice(0, 24)}`;

  const defaultBase = provider.apiBaseUrls[0] || provider.officialWebsite;
  const rawEndpoint =
    params.allowLoopbackForTest && params.testEndpointOverride
      ? params.testEndpointOverride
      : `${defaultBase.replace(/\/$/, '')}/${(params.endpointPath || '').replace(/^\//, '')}`;
  const endpoint = validateTargetEndpointUrl(rawEndpoint, provider.apiBaseUrls, Boolean(params.allowLoopbackForTest));

  // Idempotency replay check for caller-supplied idempotencyKey
  if (params.idempotencyKey) {
    const prior = await db.agentExecutionRun.findFirst({
      where: {
        clientId: project.clientId,
        agentId: 'CLIENT_API_EXECUTOR',
        providerKey: provider.key,
        action: params.actionName,
        status: 'completed',
        inputSummary: { contains: idempotencyKey },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (prior) {
      const priorOut = (() => {
        try { return JSON.parse(prior.outputSummary || '{}') as { httpStatus?: number; preview?: string }; } catch { return {}; }
      })();
      return {
        status: 'EXECUTED',
        impactLevel,
        approvalRequired: impactLevel === 'HIGH_IMPACT_ACTION',
        approvalSatisfied: true,
        providerKey: provider.key,
        actionName: params.actionName,
        httpMethod: method,
        endpointUrl: endpoint.toString(),
        httpStatus: priorOut.httpStatus ?? 200,
        attempts: 0,
        idempotencyKey,
        deduplicatedReplay: true,
        responsePreview: priorOut.preview ?? null,
        normalizedError: null,
        runId: prior.id,
        reason: `Idempotency key "${idempotencyKey}" already completed cleanly; skipped duplicate external mutation.`,
      };
    }
  }

  // Verify approval gate for HIGH_IMPACT_ACTION
  let approvalSatisfied = impactLevel !== 'HIGH_IMPACT_ACTION';
  if (impactLevel === 'HIGH_IMPACT_ACTION') {
    let checkpointValid = false;
    if (params.approvalCheckpointId) {
      const cp = await db.verificationCheckpoint.findUnique({ where: { id: params.approvalCheckpointId } });
      if (cp && cp.projectId === project.id && cp.status === 'completed') {
        checkpointValid = true;
      }
    }
    approvalSatisfied = Boolean(
      params.ownerApprovalGranted === true && (checkpointValid || (params.approvalReference && params.approvalReference.trim().length >= 4)),
    );
  }

  if (!approvalSatisfied) {
    const run = await db.agentExecutionRun.create({
      data: {
        clientId: project.clientId,
        agentId: 'CLIENT_API_EXECUTOR',
        agentName: 'Authorized Client API Execution Engine',
        providerKey: provider.key,
        action: params.actionName,
        status: 'blocked',
        inputSummary: JSON.stringify({ method, endpoint: endpoint.toString(), impactLevel, idempotencyKey }),
        correlationId,
        complianceDecision: 'DENIED_APPROVAL_REQUIRED',
        complianceReason: `High-impact client API action "${params.actionName}" requires explicit owner approval + checkpoint/reference.`,
      },
    });
    await auditEvent({
      actor: params.actor,
      action: 'engineering.client_api.approval_blocked',
      target: `${project.id}:${provider.key}:${params.actionName}`,
      providerKey: provider.key,
      ip: params.ip,
      metadata: { impactLevel, runId: run.id },
    });
    return {
      status: 'APPROVAL_REQUIRED',
      impactLevel,
      approvalRequired: true,
      approvalSatisfied: false,
      providerKey: provider.key,
      actionName: params.actionName,
      httpMethod: method,
      endpointUrl: endpoint.toString(),
      httpStatus: null,
      attempts: 0,
      idempotencyKey,
      deduplicatedReplay: false,
      responsePreview: null,
      normalizedError: null,
      runId: run.id,
      reason: `High-impact action "${params.actionName}" blocked by approval gate until owner grants explicit approval.`,
    };
  }

  // Resolve client API credential strictly from encrypted Vault
  const cred =
    (await resolveVaultSecretForServer({
      tenantId: project.clientId,
      providerKey: provider.key,
      credentialType: 'access_token',
      actor: params.actor,
      reason: `authorized_client_api:${params.actionName}`,
    })) ||
    (await resolveVaultSecretForServer({
      tenantId: project.clientId,
      providerKey: provider.key,
      credentialType: 'oauth_access_token',
      actor: params.actor,
      reason: `authorized_client_api:${params.actionName}`,
    })) ||
    (await resolveVaultSecretForServer({
      tenantId: project.clientId,
      providerKey: provider.key,
      credentialType: 'api_key',
      actor: params.actor,
      reason: `authorized_client_api:${params.actionName}`,
    }));

  if (!cred) {
    const run = await db.agentExecutionRun.create({
      data: {
        clientId: project.clientId,
        agentId: 'CLIENT_API_EXECUTOR',
        agentName: 'Authorized Client API Execution Engine',
        providerKey: provider.key,
        action: params.actionName,
        status: 'blocked',
        inputSummary: JSON.stringify({ method, endpoint: endpoint.toString(), impactLevel, idempotencyKey }),
        correlationId,
        complianceDecision: 'DENIED_NO_ACTIVE_CREDENTIAL',
        complianceReason: 'No active client access_token or api_key found in Vault.',
      },
    });
    return {
      status: 'CLIENT_ACTIVATION_REQUIRED',
      impactLevel,
      approvalRequired: impactLevel === 'HIGH_IMPACT_ACTION',
      approvalSatisfied,
      providerKey: provider.key,
      actionName: params.actionName,
      httpMethod: method,
      endpointUrl: endpoint.toString(),
      httpStatus: null,
      attempts: 0,
      idempotencyKey,
      deduplicatedReplay: false,
      responsePreview: null,
      normalizedError: null,
      runId: run.id,
      reason: 'No issued client access_token or api_key stored in Vault yet; complete owner/OAuth activation first.',
    };
  }

  const maxRetries = Math.min(Math.max(params.maxRetries ?? 2, 0), 4);
  const retryBaseDelayMs = Math.min(Math.max(params.retryBaseDelayMs ?? 150, 10), 2000);
  const timeoutMs = Math.min(Math.max(params.timeoutMs ?? 10_000, 1000), 30_000);
  const canRetrySafety = method === 'GET' || method === 'HEAD' || Boolean(params.idempotencyKey);

  const startedAt = Date.now();
  let attempts = 0;
  let lastHttpStatus: number | null = null;
  let lastPreview: string | null = null;
  let lastNormalizedError: NormalizedProviderApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    attempts = attempt + 1;
    try {
      const res = await fetch(endpoint.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${cred.plaintext}`,
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
          ...(method !== 'GET' && method !== 'HEAD' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: method !== 'GET' && method !== 'HEAD' && params.bodyPayload ? JSON.stringify(params.bodyPayload) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const rawText = await res.text();
      lastHttpStatus = res.status;
      lastPreview = redactSecretText(rawText).slice(0, 600);

      if (res.ok) {
        const run = await db.agentExecutionRun.create({
          data: {
            clientId: project.clientId,
            agentId: 'CLIENT_API_EXECUTOR',
            agentName: 'Authorized Client API Execution Engine',
            providerKey: provider.key,
            action: params.actionName,
            status: 'completed',
            inputSummary: JSON.stringify({
              method,
              endpoint: endpoint.toString(),
              impactLevel,
              idempotencyKey,
              attempts,
              approvalReference: params.approvalReference ?? params.approvalCheckpointId ?? null,
            }),
            outputSummary: JSON.stringify({ httpStatus: res.status, preview: lastPreview }),
            durationMs: Date.now() - startedAt,
            correlationId,
            complianceDecision: 'ALLOWED',
          },
        });
        await auditEvent({
          actor: params.actor,
          action: 'engineering.client_api.executed',
          target: `${project.id}:${provider.key}:${params.actionName}`,
          providerKey: provider.key,
          ip: params.ip,
          metadata: { impactLevel, httpStatus: res.status, attempts, idempotencyKey, runId: run.id },
        });
        return {
          status: 'EXECUTED',
          impactLevel,
          approvalRequired: impactLevel === 'HIGH_IMPACT_ACTION',
          approvalSatisfied: true,
          providerKey: provider.key,
          actionName: params.actionName,
          httpMethod: method,
          endpointUrl: endpoint.toString(),
          httpStatus: res.status,
          attempts,
          idempotencyKey,
          deduplicatedReplay: false,
          responsePreview: lastPreview,
          normalizedError: null,
          runId: run.id,
          reason: `Client API executed cleanly (HTTP ${res.status}, attempts=${attempts}).`,
        };
      }

      lastNormalizedError = normalizeProviderApiError({
        httpStatus: res.status,
        rawBody: lastPreview,
        retryAfterHeader: res.headers.get('retry-after'),
      });
      if (canRetrySafety && lastNormalizedError.retryable && attempt < maxRetries) {
        const retryAfterSec = Number(res.headers.get('retry-after') || '0');
        const waitMs = retryAfterSec > 0 ? Math.min(retryAfterSec * 1000, 1500) : retryBaseDelayMs * 2 ** attempt;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      break;
    } catch (err) {
      lastNormalizedError = normalizeProviderApiError({
        httpStatus: null,
        fallbackMessage: err instanceof Error ? err.message : 'Network error',
      });
      if (canRetrySafety && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryBaseDelayMs * 2 ** attempt));
        continue;
      }
      break;
    }
  }

  const run = await db.agentExecutionRun.create({
    data: {
      clientId: project.clientId,
      agentId: 'CLIENT_API_EXECUTOR',
      agentName: 'Authorized Client API Execution Engine',
      providerKey: provider.key,
      action: params.actionName,
      status: 'failed',
      inputSummary: JSON.stringify({ method, endpoint: endpoint.toString(), impactLevel, idempotencyKey, attempts }),
      outputSummary: JSON.stringify({ httpStatus: lastHttpStatus, error: lastNormalizedError }),
      complianceDecision: 'ALLOWED',
      complianceReason: lastNormalizedError?.message || 'Remote client API failed',
      durationMs: Date.now() - startedAt,
      correlationId,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'engineering.client_api.failed',
    target: `${project.id}:${provider.key}:${params.actionName}`,
    providerKey: provider.key,
    ip: params.ip,
    metadata: { impactLevel, httpStatus: lastHttpStatus, attempts, code: lastNormalizedError?.code, runId: run.id },
  });

  return {
    status: 'FAILED',
    impactLevel,
    approvalRequired: impactLevel === 'HIGH_IMPACT_ACTION',
    approvalSatisfied: true,
    providerKey: provider.key,
    actionName: params.actionName,
    httpMethod: method,
    endpointUrl: endpoint.toString(),
    httpStatus: lastHttpStatus,
    attempts,
    idempotencyKey,
    deduplicatedReplay: false,
    responsePreview: lastPreview,
    normalizedError: lastNormalizedError,
    runId: run.id,
    reason: lastNormalizedError?.message || 'Remote API failed.',
  };
}
