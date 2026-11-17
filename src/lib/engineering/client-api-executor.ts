import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { resolveVaultSecretForServer, redactSecretText } from '@/lib/onboarding/vault-service';
import { auditEvent } from '@/lib/security/audit';

export type ApiActionImpactLevel = 'READ_ONLY' | 'LOW_IMPACT_WRITE' | 'HIGH_IMPACT_ACTION';

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
  responsePreview: string | null;
  runId: string;
  reason: string;
}

export async function executeAuthorizedClientApiAction(params: {
  projectId: string;
  providerKey: string;
  actionName: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpointPath?: string;
  bodyPayload?: Record<string, unknown>;
  requestedImpactLevel?: ApiActionImpactLevel;
  ownerApprovalGranted?: boolean;
  approvalCheckpointId?: string;
  approvalReference?: string;
  allowLoopbackForTest?: boolean;
  testEndpointOverride?: string;
  actor: string;
  ip?: string;
}): Promise<ClientApiExecutionResult> {
  const project = await db.integrationProject.findUnique({ where: { id: params.projectId } });
  if (!project) throw new Error('IntegrationProject not found.');

  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error(`Unknown provider: ${params.providerKey}`);

  const method = (params.httpMethod || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  const impactLevel = classifyApiActionImpact({
    actionName: params.actionName,
    httpMethod: method,
    requestedImpactLevel: params.requestedImpactLevel,
  });

  const correlationId = `exec_${randomUUID()}`;
  const defaultBase = provider.apiBaseUrls[0] || provider.officialWebsite;
  const rawEndpoint =
    params.allowLoopbackForTest && params.testEndpointOverride
      ? params.testEndpointOverride
      : `${defaultBase.replace(/\/$/, '')}/${(params.endpointPath || '').replace(/^\//, '')}`;
  const endpoint = validateTargetEndpointUrl(rawEndpoint, provider.apiBaseUrls, Boolean(params.allowLoopbackForTest));

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
        inputSummary: JSON.stringify({ method, endpoint: endpoint.toString(), impactLevel }),
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
      responsePreview: null,
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
        inputSummary: JSON.stringify({ method, endpoint: endpoint.toString(), impactLevel }),
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
      responsePreview: null,
      runId: run.id,
      reason: 'No issued client access_token or api_key stored in Vault yet; complete owner/OAuth activation first.',
    };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(endpoint.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${cred.plaintext}`,
        Accept: 'application/json',
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method !== 'GET' && params.bodyPayload ? JSON.stringify(params.bodyPayload) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const rawText = await res.text();
    const redactedPreview = redactSecretText(rawText).slice(0, 600);

    const run = await db.agentExecutionRun.create({
      data: {
        clientId: project.clientId,
        agentId: 'CLIENT_API_EXECUTOR',
        agentName: 'Authorized Client API Execution Engine',
        providerKey: provider.key,
        action: params.actionName,
        status: res.ok ? 'completed' : 'failed',
        inputSummary: JSON.stringify({
          method,
          endpoint: endpoint.toString(),
          impactLevel,
          approvalReference: params.approvalReference ?? params.approvalCheckpointId ?? null,
        }),
        outputSummary: JSON.stringify({ httpStatus: res.status, preview: redactedPreview }),
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
      metadata: { impactLevel, httpStatus: res.status, runId: run.id },
    });

    return {
      status: res.ok ? 'EXECUTED' : 'FAILED',
      impactLevel,
      approvalRequired: impactLevel === 'HIGH_IMPACT_ACTION',
      approvalSatisfied: true,
      providerKey: provider.key,
      actionName: params.actionName,
      httpMethod: method,
      endpointUrl: endpoint.toString(),
      httpStatus: res.status,
      responsePreview: redactedPreview,
      runId: run.id,
      reason: res.ok ? `Client API executed cleanly (HTTP ${res.status}).` : `Remote API returned HTTP ${res.status}.`,
    };
  } catch (err) {
    const msg = redactSecretText(err instanceof Error ? err.message : 'Network error');
    const run = await db.agentExecutionRun.create({
      data: {
        clientId: project.clientId,
        agentId: 'CLIENT_API_EXECUTOR',
        agentName: 'Authorized Client API Execution Engine',
        providerKey: provider.key,
        action: params.actionName,
        status: 'failed',
        inputSummary: JSON.stringify({ method, endpoint: endpoint.toString(), impactLevel }),
        complianceDecision: 'ALLOWED',
        complianceReason: msg,
        durationMs: Date.now() - startedAt,
        correlationId,
      },
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
      httpStatus: null,
      responsePreview: null,
      runId: run.id,
      reason: msg,
    };
  }
}
