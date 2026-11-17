import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';

/**
 * Master Production Spec Section 5: Standardized 20-State Account & Onboarding State Machine
 */
export const ONBOARDING_STATES = [
  'NOT_STARTED',
  'DISCOVERY',
  'ACCOUNT_EXISTS',
  'REGISTRATION_REQUIRED',
  'REGISTRATION_PREPARED',
  'AWAITING_OWNER_REVIEW',
  'AWAITING_EMAIL_VERIFICATION',
  'AWAITING_PHONE_VERIFICATION',
  'AWAITING_CAPTCHA',
  'AWAITING_MFA',
  'AWAITING_BUSINESS_VERIFICATION',
  'REGISTRATION_SUBMITTED',
  'ACCOUNT_CREATED',
  'DEVELOPER_SETUP_REQUIRED',
  'APP_REVIEW_REQUIRED',
  'AUTHORIZED',
  'CONFIGURED',
  'VERIFIED',
  'BLOCKED',
  'FAILED',
] as const;

export type OnboardingState = (typeof ONBOARDING_STATES)[number];

export const OWNER_CHECKPOINT_STATES: readonly OnboardingState[] = [
  'AWAITING_OWNER_REVIEW',
  'AWAITING_EMAIL_VERIFICATION',
  'AWAITING_PHONE_VERIFICATION',
  'AWAITING_CAPTCHA',
  'AWAITING_MFA',
  'AWAITING_BUSINESS_VERIFICATION',
  'APP_REVIEW_REQUIRED',
];

export const STATE_PROGRESS: Record<OnboardingState, number> = {
  NOT_STARTED: 0,
  DISCOVERY: 8,
  ACCOUNT_EXISTS: 18,
  REGISTRATION_REQUIRED: 14,
  REGISTRATION_PREPARED: 24,
  AWAITING_OWNER_REVIEW: 30,
  AWAITING_EMAIL_VERIFICATION: 36,
  AWAITING_PHONE_VERIFICATION: 40,
  AWAITING_CAPTCHA: 44,
  AWAITING_MFA: 48,
  AWAITING_BUSINESS_VERIFICATION: 54,
  REGISTRATION_SUBMITTED: 58,
  ACCOUNT_CREATED: 64,
  DEVELOPER_SETUP_REQUIRED: 70,
  APP_REVIEW_REQUIRED: 76,
  AUTHORIZED: 84,
  CONFIGURED: 92,
  VERIFIED: 100,
  BLOCKED: 0,
  FAILED: 0,
};

const ALLOWED_TRANSITIONS: Record<OnboardingState, readonly OnboardingState[]> = {
  NOT_STARTED: ['DISCOVERY', 'ACCOUNT_EXISTS', 'REGISTRATION_REQUIRED', 'BLOCKED', 'FAILED'],
  DISCOVERY: ['ACCOUNT_EXISTS', 'REGISTRATION_REQUIRED', 'DEVELOPER_SETUP_REQUIRED', 'AWAITING_OWNER_REVIEW', 'BLOCKED', 'FAILED'],
  ACCOUNT_EXISTS: ['AWAITING_OWNER_REVIEW', 'AWAITING_MFA', 'AWAITING_BUSINESS_VERIFICATION', 'DEVELOPER_SETUP_REQUIRED', 'AUTHORIZED', 'CONFIGURED', 'BLOCKED', 'FAILED'],
  REGISTRATION_REQUIRED: ['REGISTRATION_PREPARED', 'ACCOUNT_EXISTS', 'AWAITING_OWNER_REVIEW', 'BLOCKED', 'FAILED'],
  REGISTRATION_PREPARED: ['AWAITING_OWNER_REVIEW', 'REGISTRATION_SUBMITTED', 'BLOCKED', 'FAILED'],
  AWAITING_OWNER_REVIEW: [
    'AWAITING_EMAIL_VERIFICATION',
    'AWAITING_PHONE_VERIFICATION',
    'AWAITING_CAPTCHA',
    'AWAITING_MFA',
    'AWAITING_BUSINESS_VERIFICATION',
    'REGISTRATION_SUBMITTED',
    'ACCOUNT_CREATED',
    'DEVELOPER_SETUP_REQUIRED',
    'APP_REVIEW_REQUIRED',
    'AUTHORIZED',
    'CONFIGURED',
    'BLOCKED',
    'FAILED',
  ],
  AWAITING_EMAIL_VERIFICATION: ['AWAITING_PHONE_VERIFICATION', 'AWAITING_CAPTCHA', 'AWAITING_MFA', 'AWAITING_BUSINESS_VERIFICATION', 'REGISTRATION_SUBMITTED', 'ACCOUNT_CREATED', 'BLOCKED', 'FAILED'],
  AWAITING_PHONE_VERIFICATION: ['AWAITING_EMAIL_VERIFICATION', 'AWAITING_CAPTCHA', 'AWAITING_MFA', 'AWAITING_BUSINESS_VERIFICATION', 'REGISTRATION_SUBMITTED', 'ACCOUNT_CREATED', 'BLOCKED', 'FAILED'],
  AWAITING_CAPTCHA: ['AWAITING_OWNER_REVIEW', 'AWAITING_EMAIL_VERIFICATION', 'AWAITING_PHONE_VERIFICATION', 'AWAITING_MFA', 'REGISTRATION_SUBMITTED', 'ACCOUNT_CREATED', 'BLOCKED', 'FAILED'],
  AWAITING_MFA: ['AWAITING_OWNER_REVIEW', 'AWAITING_BUSINESS_VERIFICATION', 'REGISTRATION_SUBMITTED', 'ACCOUNT_CREATED', 'DEVELOPER_SETUP_REQUIRED', 'AUTHORIZED', 'BLOCKED', 'FAILED'],
  AWAITING_BUSINESS_VERIFICATION: ['AWAITING_OWNER_REVIEW', 'ACCOUNT_CREATED', 'DEVELOPER_SETUP_REQUIRED', 'APP_REVIEW_REQUIRED', 'AUTHORIZED', 'BLOCKED', 'FAILED'],
  REGISTRATION_SUBMITTED: ['AWAITING_EMAIL_VERIFICATION', 'AWAITING_PHONE_VERIFICATION', 'AWAITING_CAPTCHA', 'AWAITING_MFA', 'AWAITING_BUSINESS_VERIFICATION', 'ACCOUNT_CREATED', 'BLOCKED', 'FAILED'],
  ACCOUNT_CREATED: ['DEVELOPER_SETUP_REQUIRED', 'AWAITING_BUSINESS_VERIFICATION', 'AUTHORIZED', 'CONFIGURED', 'BLOCKED', 'FAILED'],
  DEVELOPER_SETUP_REQUIRED: ['AWAITING_OWNER_REVIEW', 'APP_REVIEW_REQUIRED', 'AUTHORIZED', 'CONFIGURED', 'BLOCKED', 'FAILED'],
  APP_REVIEW_REQUIRED: ['AWAITING_OWNER_REVIEW', 'AWAITING_BUSINESS_VERIFICATION', 'AUTHORIZED', 'CONFIGURED', 'BLOCKED', 'FAILED'],
  AUTHORIZED: ['CONFIGURED', 'DEVELOPER_SETUP_REQUIRED', 'APP_REVIEW_REQUIRED', 'AWAITING_OWNER_REVIEW', 'BLOCKED', 'FAILED'],
  CONFIGURED: ['VERIFIED', 'AUTHORIZED', 'AWAITING_OWNER_REVIEW', 'BLOCKED', 'FAILED'],
  VERIFIED: ['CONFIGURED', 'DISCOVERY', 'BLOCKED', 'FAILED'],
  BLOCKED: ['DISCOVERY', 'AWAITING_OWNER_REVIEW', 'REGISTRATION_REQUIRED', 'DEVELOPER_SETUP_REQUIRED', 'APP_REVIEW_REQUIRED', 'AUTHORIZED', 'FAILED'],
  FAILED: ['NOT_STARTED', 'DISCOVERY', 'REGISTRATION_REQUIRED', 'AWAITING_OWNER_REVIEW', 'DEVELOPER_SETUP_REQUIRED', 'AUTHORIZED', 'CONFIGURED'],
};

export function isValidOnboardingState(value: string): value is OnboardingState {
  return (ONBOARDING_STATES as readonly string[]).includes(value);
}

export function getAllowedNextStates(state: OnboardingState): readonly OnboardingState[] {
  return ALLOWED_TRANSITIONS[state] ?? [];
}

export function canTransitionWorkflowState(from: OnboardingState, to: OnboardingState): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export interface WorkflowHistoryEntry {
  from: OnboardingState;
  to: OnboardingState;
  reason: string;
  actor: string;
  at: string;
  approvalRequired?: boolean;
}

function parseHistory(raw: string): WorkflowHistoryEntry[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getOrCreateWorkflow(params: {
  tenantId: string;
  providerKey: string;
  correlationId?: string;
}) {
  const provider = getProviderByKey(params.providerKey);
  if (!provider) {
    throw new Error(`Unknown provider key: ${params.providerKey}`);
  }

  const existing = await db.onboardingWorkflow.findUnique({
    where: {
      clientId_providerKey: {
        clientId: params.tenantId,
        providerKey: params.providerKey,
      },
    },
  });
  if (existing) return existing;

  return db.onboardingWorkflow.create({
    data: {
      clientId: params.tenantId,
      providerKey: params.providerKey,
      state: 'NOT_STARTED',
      implementationLevel: provider.implementationLevel,
      preparedPayload: JSON.stringify({
        canonicalCategory: provider.canonicalCategory,
        capabilityMatrix: provider.capabilityMatrix,
      }),
      history: JSON.stringify([
        {
          from: 'NOT_STARTED',
          to: 'NOT_STARTED',
          reason: 'Workflow initialized',
          actor: 'system',
          at: new Date().toISOString(),
        },
      ]),
      correlationId: params.correlationId ?? null,
    },
  });
}

export async function transitionWorkflowState(params: {
  workflowId: string;
  nextState: OnboardingState;
  actor: string;
  reason: string;
  blockerReason?: string | null;
  requiresOwnerApproval?: boolean;
  approvalPrompt?: string | null;
  lastError?: string | null;
  correlationId?: string;
}) {
  const current = await db.onboardingWorkflow.findUnique({
    where: { id: params.workflowId },
  });
  if (!current) throw new Error('Workflow not found.');

  const fromState = (isValidOnboardingState(current.state) ? current.state : 'NOT_STARTED') as OnboardingState;
  if (!canTransitionWorkflowState(fromState, params.nextState)) {
    throw new Error(`Invalid state transition from ${fromState} to ${params.nextState}.`);
  }

  const history = parseHistory(current.history);
  history.push({
    from: fromState,
    to: params.nextState,
    reason: params.reason,
    actor: params.actor,
    at: new Date().toISOString(),
    approvalRequired: params.requiresOwnerApproval,
  });

  let nextLevel = current.implementationLevel;
  if (params.nextState === 'DISCOVERY' || params.nextState === 'REGISTRATION_PREPARED') nextLevel = Math.max(nextLevel, 2);
  if (params.nextState === 'DEVELOPER_SETUP_REQUIRED' || params.nextState === 'APP_REVIEW_REQUIRED') nextLevel = Math.max(nextLevel, 3);
  if (params.nextState === 'AUTHORIZED') nextLevel = Math.max(nextLevel, 4);
  if (params.nextState === 'CONFIGURED') nextLevel = Math.max(nextLevel, 5);
  if (params.nextState === 'VERIFIED') nextLevel = Math.max(nextLevel, 6);

  const needsApproval = params.requiresOwnerApproval ?? (OWNER_CHECKPOINT_STATES as readonly string[]).includes(params.nextState);
  const resolvedApproval = !needsApproval && (OWNER_CHECKPOINT_STATES as readonly string[]).includes(fromState);

  return db.onboardingWorkflow.update({
    where: { id: current.id },
    data: {
      state: params.nextState,
      implementationLevel: nextLevel,
      pendingCheckpoint: needsApproval ? (params.approvalPrompt ?? params.reason) : null,
      ownerApprovedAt: resolvedApproval ? new Date() : current.ownerApprovedAt,
      ownerApprovedBy: resolvedApproval ? params.actor : current.ownerApprovedBy,
      lastError: params.nextState === 'FAILED'
        ? (params.lastError ?? params.reason)
        : params.nextState === 'BLOCKED'
          ? (params.blockerReason ?? params.reason)
          : null,
      history: JSON.stringify(history.slice(-100)),
      correlationId: params.correlationId ?? current.correlationId,
    },
  });
}

export async function listWorkflows(tenantId?: string) {
  return db.onboardingWorkflow.findMany({
    where: tenantId ? { clientId: tenantId } : undefined,
    orderBy: [{ updatedAt: 'desc' }],
  });
}
