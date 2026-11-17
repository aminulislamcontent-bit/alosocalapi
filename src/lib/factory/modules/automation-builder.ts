import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';
import { runFactoryAiInference } from '@/lib/factory/ai-router';

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'delay' | 'approval_checkpoint';
  label: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  branch?: 'default' | 'true' | 'false';
}

export function validateWorkflowDag(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('Workflow must contain at least one trigger node.');
  }
  const triggers = nodes.filter(n => n.type === 'trigger');
  if (triggers.length !== 1) {
    throw new Error('Workflow must contain exactly one trigger entry node.');
  }
  const nodeIds = new Set(nodes.map(n => n.id));
  if (nodeIds.size !== nodes.length) {
    throw new Error('Workflow node IDs must be unique.');
  }

  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`Invalid edge referencing unknown node (${edge.source} -> ${edge.target}).`);
    }
    adj.get(edge.source)!.push(edge.target);
  }

  // Cycle check via DFS coloring
  const state = new Map<string, 'unvisited' | 'visiting' | 'done'>();
  const visit = (id: string) => {
    const s = state.get(id) ?? 'unvisited';
    if (s === 'visiting') throw new Error(`Cycle detected in automation workflow at node '${id}'.`);
    if (s === 'done') return;
    state.set(id, 'visiting');
    for (const nxt of adj.get(id) ?? []) visit(nxt);
    state.set(id, 'done');
  };
  for (const id of nodeIds) visit(id);

  return { ok: true, triggerNodeId: triggers[0].id };
}

function evaluateCondition(config: Record<string, unknown> | undefined, ctx: Record<string, unknown>): boolean {
  const field = String(config?.field || '');
  const op = String(config?.operator || 'equals');
  const target = config?.value;
  const actual = field ? ctx[field] : undefined;

  if (op === 'equals') return actual === target;
  if (op === 'not_equals') return actual !== target;
  if (op === 'contains') return String(actual ?? '').toLowerCase().includes(String(target ?? '').toLowerCase());
  if (op === 'gt') return Number(actual) > Number(target);
  if (op === 'lt') return Number(actual) < Number(target);
  if (op === 'in' && Array.isArray(target)) return target.includes(actual);
  return Boolean(actual);
}

export async function saveAutomationWorkflow(params: {
  workspaceId: string;
  name: string;
  triggerType: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  status?: 'draft' | 'active' | 'paused';
  requiresApproval?: boolean;
  maxAttempts?: number;
  actor: string;
  ip?: string;
}) {
  validateWorkflowDag(params.nodes, params.edges);

  const existing = await db.factoryAutomationWorkflow.findUnique({
    where: { workspaceId_name: { workspaceId: params.workspaceId, name: params.name.trim() } },
  });

  const wf = await db.factoryAutomationWorkflow.upsert({
    where: { workspaceId_name: { workspaceId: params.workspaceId, name: params.name.trim() } },
    update: {
      triggerType: params.triggerType,
      status: params.status || 'active',
      version: (existing?.version ?? 0) + 1,
      nodesJson: JSON.stringify(params.nodes),
      edgesJson: JSON.stringify(params.edges),
      retryPolicyJson: JSON.stringify({ maxAttempts: params.maxAttempts ?? 3, backoffMs: 15000 }),
      requiresApproval: params.requiresApproval ?? params.nodes.some(n => n.type === 'approval_checkpoint'),
    },
    create: {
      workspaceId: params.workspaceId,
      name: params.name.trim(),
      triggerType: params.triggerType,
      status: params.status || 'active',
      nodesJson: JSON.stringify(params.nodes),
      edgesJson: JSON.stringify(params.edges),
      retryPolicyJson: JSON.stringify({ maxAttempts: params.maxAttempts ?? 3, backoffMs: 15000 }),
      requiresApproval: params.requiresApproval ?? params.nodes.some(n => n.type === 'approval_checkpoint'),
      createdBy: params.actor,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.automation.workflow.save',
    target: `${params.workspaceId}:${wf.id}`,
    ip: params.ip,
    metadata: { name: wf.name, version: wf.version, nodeCount: params.nodes.length },
  });

  return wf;
}

async function advanceRunExecution(runId: string, actor: string) {
  const run = await db.factoryAutomationRun.findUnique({
    where: { id: runId },
    include: { workflow: true },
  });
  if (!run) throw new Error('Workflow run not found.');

  const nodes = JSON.parse(run.workflow.nodesJson) as WorkflowNode[];
  const edges = JSON.parse(run.workflow.edgesJson) as WorkflowEdge[];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const context = JSON.parse(run.contextJson) as Record<string, unknown>;
  const logs = JSON.parse(run.stepLogsJson) as {
    nodeId: string;
    type: string;
    status: string;
    detail: string;
    at: string;
  }[];

  let currentId = run.currentNodeId || nodes.find(n => n.type === 'trigger')?.id || null;
  let stepsExecuted = 0;

  while (currentId && stepsExecuted < 100) {
    stepsExecuted += 1;
    const node = nodeMap.get(currentId);
    if (!node) break;

    if (node.type === 'approval_checkpoint') {
      // Pause unless already approved for this checkpoint node
      if (run.approvedBy && run.pendingApprovalNode === node.id) {
        logs.push({
          nodeId: node.id,
          type: node.type,
          status: 'approved',
          detail: `Approved by ${run.approvedBy}`,
          at: new Date().toISOString(),
        });
      } else {
        logs.push({
          nodeId: node.id,
          type: node.type,
          status: 'awaiting_approval',
          detail: `Paused for human owner approval: ${node.label}`,
          at: new Date().toISOString(),
        });
        return db.factoryAutomationRun.update({
          where: { id: run.id },
          data: {
            status: 'awaiting_approval',
            currentNodeId: node.id,
            pendingApprovalNode: node.id,
            stepLogsJson: JSON.stringify(logs),
            contextJson: JSON.stringify(context),
          },
        });
      }
    } else if (node.type === 'condition') {
      const matched = evaluateCondition(node.config, context);
      logs.push({
        nodeId: node.id,
        type: node.type,
        status: 'evaluated',
        detail: `Branch evaluated to ${matched}`,
        at: new Date().toISOString(),
      });
      const nextEdge =
        edges.find(e => e.source === node.id && e.branch === (matched ? 'true' : 'false')) ||
        edges.find(e => e.source === node.id);
      currentId = nextEdge?.target || null;
      continue;
    } else if (node.type === 'action') {
      const actionType = String(node.config?.actionType || 'log');
      if (actionType === 'simulate_transient_error' && !context.__recovered) {
        const nextAttempts = run.attempts + 1;
        const exhausted = nextAttempts >= run.maxAttempts;
        logs.push({
          nodeId: node.id,
          type: node.type,
          status: 'error',
          detail: 'Transient downstream failure simulated at action step.',
          at: new Date().toISOString(),
        });
        return db.factoryAutomationRun.update({
          where: { id: run.id },
          data: {
            status: exhausted ? 'failed' : 'retrying',
            currentNodeId: node.id,
            attempts: nextAttempts,
            nextRetryAt: exhausted ? null : new Date(Date.now() + 5_000),
            lastError: 'Transient downstream failure simulated at action step.',
            stepLogsJson: JSON.stringify(logs),
          },
        });
      }

      if (actionType === 'ai.generate_copy') {
        const ai = await runFactoryAiInference({
          workspaceId: run.workspaceId,
          moduleKey: 'marketing_automation',
          task: 'marketing_copy',
          prompt: String(node.config?.prompt || context.topic || node.label),
          actor,
        });
        context.generatedCopy = ai.outputText;
      } else if (actionType === 'crm.create_lead') {
        const name = String(context.contactName || node.config?.contactName || 'Automation Lead');
        const created = await db.factoryCrmContact.create({
          data: {
            workspaceId: run.workspaceId,
            fullName: name,
            email: context.contactEmail ? String(context.contactEmail) : null,
            source: 'marketing_automation',
            consentStatus: context.consentGranted ? 'granted' : 'not_collected',
          },
        });
        context.createdCrmContactId = created.id;
      } else if (actionType === 'job.enqueue') {
        await db.factoryJob.create({
          data: {
            workspaceId: run.workspaceId,
            moduleKey: String(node.config?.targetModule || 'marketing_automation'),
            jobType: String(node.config?.jobType || 'automation.action'),
            idempotencyKey: `wf-${run.id}-${node.id}`,
            payload: JSON.stringify({ runId: run.id, context }),
          },
        });
      }

      logs.push({
        nodeId: node.id,
        type: node.type,
        status: 'completed',
        detail: `Executed action '${actionType}' (${node.label})`,
        at: new Date().toISOString(),
      });
    } else {
      logs.push({
        nodeId: node.id,
        type: node.type,
        status: 'completed',
        detail: `${node.type}: ${node.label}`,
        at: new Date().toISOString(),
      });
    }

    const nextEdge = edges.find(e => e.source === node.id);
    currentId = nextEdge?.target || null;
  }

  return db.factoryAutomationRun.update({
    where: { id: run.id },
    data: {
      status: 'completed',
      currentNodeId: null,
      pendingApprovalNode: null,
      contextJson: JSON.stringify(context),
      stepLogsJson: JSON.stringify(logs),
      finishedAt: new Date(),
    },
  });
}

export async function triggerAutomationWorkflow(params: {
  workspaceId: string;
  workflowId: string;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
  actor: string;
  ip?: string;
}) {
  const wf = await db.factoryAutomationWorkflow.findFirst({
    where: { id: params.workflowId, workspaceId: params.workspaceId },
  });
  if (!wf) throw new Error('Automation workflow not found.');
  if (wf.status !== 'active') throw new Error(`Workflow is '${wf.status}' and must be active to trigger.`);

  const idempotencyKey = params.idempotencyKey?.trim() || `run-${crypto.randomUUID()}`;
  const existing = await db.factoryAutomationRun.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { run: existing, deduplicated: true };
  }

  const retryPolicy = (() => {
    try { return JSON.parse(wf.retryPolicyJson) as { maxAttempts?: number }; }
    catch { return { maxAttempts: 3 }; }
  })();

  const created = await db.factoryAutomationRun.create({
    data: {
      workspaceId: params.workspaceId,
      workflowId: wf.id,
      idempotencyKey,
      status: 'running',
      contextJson: JSON.stringify(params.context ?? {}),
      stepLogsJson: '[]',
      maxAttempts: retryPolicy.maxAttempts ?? 3,
    },
  });

  const executed = await advanceRunExecution(created.id, params.actor);

  await auditEvent({
    actor: params.actor,
    action: 'factory.automation.run.trigger',
    target: `${params.workspaceId}:${executed.id}`,
    ip: params.ip,
    metadata: { workflowId: wf.id, status: executed.status, idempotencyKey },
  });

  return { run: executed, deduplicated: false };
}

export async function decideAutomationApproval(params: {
  workspaceId: string;
  runId: string;
  decision: 'approve' | 'reject';
  actor: string;
  ip?: string;
}) {
  const run = await db.factoryAutomationRun.findFirst({
    where: { id: params.runId, workspaceId: params.workspaceId },
  });
  if (!run) throw new Error('Workflow run not found.');
  if (run.status !== 'awaiting_approval') {
    throw new Error(`Run is not awaiting approval (current status: ${run.status}).`);
  }

  if (params.decision === 'reject') {
    const cancelled = await db.factoryAutomationRun.update({
      where: { id: run.id },
      data: {
        status: 'cancelled',
        approvedBy: params.actor,
        approvedAt: new Date(),
        finishedAt: new Date(),
        lastError: `Approval rejected by ${params.actor}`,
      },
    });
    return cancelled;
  }

  await db.factoryAutomationRun.update({
    where: { id: run.id },
    data: {
      status: 'running',
      approvedBy: params.actor,
      approvedAt: new Date(),
    },
  });

  const resumed = await advanceRunExecution(run.id, params.actor);
  await auditEvent({
    actor: params.actor,
    action: 'factory.automation.run.approved',
    target: `${params.workspaceId}:${run.id}`,
    ip: params.ip,
    metadata: { status: resumed.status },
  });

  return resumed;
}

export async function recoverFailedAutomationRun(params: {
  workspaceId: string;
  runId: string;
  markRecovered?: boolean;
  actor: string;
}) {
  const run = await db.factoryAutomationRun.findFirst({
    where: { id: params.runId, workspaceId: params.workspaceId },
  });
  if (!run) throw new Error('Workflow run not found.');
  if (!['failed', 'retrying'].includes(run.status)) {
    throw new Error(`Run status '${run.status}' does not require recovery.`);
  }

  const ctx = (() => {
    try { return JSON.parse(run.contextJson) as Record<string, unknown>; }
    catch { return {}; }
  })();
  if (params.markRecovered) ctx.__recovered = true;

  await db.factoryAutomationRun.update({
    where: { id: run.id },
    data: {
      status: 'running',
      contextJson: JSON.stringify(ctx),
      lastError: null,
    },
  });

  return advanceRunExecution(run.id, params.actor);
}
