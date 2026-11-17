import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { getOrCreateWorkflow, isValidOnboardingState, transitionWorkflowState } from '@/lib/onboarding/state-machine';
import { auditEvent } from '@/lib/security/audit';

export type VerificationCheckpointType =
  | 'email_verification'
  | 'otp'
  | 'mfa'
  | 'captcha'
  | 'identity_verification'
  | 'business_verification'
  | 'domain_ownership'
  | 'payment_authorization'
  | 'app_review'
  | 'permission_approval'
  | 'legal_terms';

const FORBIDDEN_INPUT_KEY_RE = /(password|passwd|otp|verification_code|pin|recovery_code|seed_phrase|secret_question)/i;

export async function generateRequiredCheckpointsForProvider(params: {
  projectId: string;
  providerKey: string;
  actor: string;
}) {
  const project = await db.integrationProject.findUnique({ where: { id: params.projectId } });
  if (!project) throw new Error('IntegrationProject not found.');
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error(`Unknown provider key: ${params.providerKey}`);

  const checkpointSpecs: {
    checkpointType: VerificationCheckpointType;
    officialPortalUrl: string;
    instructions: string;
  }[] = [
    {
      checkpointType: 'legal_terms',
      officialPortalUrl: provider.officialDeveloperPortal || provider.officialWebsite,
      instructions: `Review and accept official ${provider.displayName} developer terms and privacy policies directly in the official portal.`,
    },
  ];

  if (provider.canonicalCategory === 'Email Marketing') {
    checkpointSpecs.push({
      checkpointType: 'domain_ownership',
      officialPortalUrl: provider.officialDeveloperPortal || provider.officialWebsite,
      instructions: `Publish SPF, DKIM, and DMARC DNS records for ${project.domain} and confirm domain ownership inside ${provider.displayName}.`,
    });
  }
  if (provider.businessVerificationRequirements && !/none/i.test(provider.businessVerificationRequirements)) {
    checkpointSpecs.push({
      checkpointType: 'business_verification',
      officialPortalUrl: provider.officialDeveloperPortal || provider.officialWebsite,
      instructions: `${provider.businessVerificationRequirements} (complete directly in official portal; never upload sensitive identity docs into unapproved channels).`,
    });
  }
  if (provider.oauthSupport) {
    checkpointSpecs.push({
      checkpointType: 'permission_approval',
      officialPortalUrl: provider.officialDeveloperPortal || provider.officialWebsite,
      instructions: `Sign in via official ${provider.displayName} OAuth authorization URL and grant least-privilege scopes: ${provider.requiredScopes.join(', ') || 'standard read/write'}.`,
    });
  }
  if (/app review|review/i.test(provider.developerAccountRequirements)) {
    checkpointSpecs.push({
      checkpointType: 'app_review',
      officialPortalUrl: provider.officialDeveloperPortal || provider.officialWebsite,
      instructions: `Submit screencast & privacy URL (${project.websiteUrl}) for ${provider.displayName} App Review if requesting production elevated scopes.`,
    });
  }

  const created: Awaited<ReturnType<typeof db.verificationCheckpoint.create>>[] = [];
  for (const spec of checkpointSpecs) {
    const existing = await db.verificationCheckpoint.findFirst({
      where: {
        projectId: project.id,
        providerKey: provider.key,
        checkpointType: spec.checkpointType,
      },
    });
    if (existing) {
      created.push(existing);
    } else {
      const row = await db.verificationCheckpoint.create({
        data: {
          projectId: project.id,
          providerKey: provider.key,
          checkpointType: spec.checkpointType,
          status: 'pending',
          officialPortalUrl: spec.officialPortalUrl,
          instructions: spec.instructions,
        },
      });
      created.push(row);
    }
  }

  await db.integrationProject.update({
    where: { id: project.id },
    data: { status: 'awaiting_verification' },
  });

  await auditEvent({
    actor: params.actor,
    action: 'engineering.checkpoints.generated',
    target: `${project.id}:${provider.key}`,
    providerKey: provider.key,
    metadata: { count: created.length },
  });

  return created;
}

export async function completeCheckpointAndResumeWorkflow(params: {
  checkpointId: string;
  ownerConfirmationNote?: string;
  ownerInputMeta?: Record<string, unknown>;
  actor: string;
  ip?: string;
}) {
  // Never allow collection of passwords, OTPs, or MFA recovery codes
  for (const key of Object.keys(params.ownerInputMeta ?? {})) {
    if (FORBIDDEN_INPUT_KEY_RE.test(key)) {
      throw new Error(`Security violation: ALOAPI forbids collecting '${key}'. Owner must verify directly on the provider's official interface.`);
    }
  }

  const cp = await db.verificationCheckpoint.findUnique({
    where: { id: params.checkpointId },
    include: { project: true },
  });
  if (!cp) throw new Error('VerificationCheckpoint not found.');

  // Sync underlying 20-state onboarding workflow and advance cleanly past awaiting gate
  const wf = await getOrCreateWorkflow({
    tenantId: cp.project.clientId,
    providerKey: cp.providerKey,
  });

  let resumedState = wf.state;
  const targetState = cp.checkpointType === 'permission_approval' ? 'AUTHORIZED' : 'CONFIGURED';

  // Walk legal state transitions cleanly from NOT_STARTED/DISCOVERY/etc. without inventing invalid jumps
  if (isValidOnboardingState(wf.state)) {
    if (wf.state === 'NOT_STARTED') {
      await transitionWorkflowState({
        workflowId: wf.id,
        nextState: 'DISCOVERY',
        actor: params.actor,
        reason: 'Auto-resumed by Verification Checkpoint Coordinator',
      });
      await transitionWorkflowState({
        workflowId: wf.id,
        nextState: 'DEVELOPER_SETUP_REQUIRED',
        actor: params.actor,
        reason: `Owner completed ${cp.checkpointType}`,
      });
    }
    const refreshed = await db.onboardingWorkflow.findUnique({ where: { id: wf.id } });
    if (refreshed && isValidOnboardingState(refreshed.state)) {
      try {
        const updatedWf = await transitionWorkflowState({
          workflowId: wf.id,
          nextState: targetState,
          actor: params.actor,
          reason: params.ownerConfirmationNote || `Completed ${cp.checkpointType} via official portal`,
        });
        resumedState = updatedWf.state;
      } catch {
        // If already further ahead (e.g. VERIFIED), keep highest valid state
        resumedState = refreshed.state;
      }
    }
  }

  const updatedCheckpoint = await db.verificationCheckpoint.update({
    where: { id: cp.id },
    data: {
      status: 'completed',
      ownerInputMetaJson: JSON.stringify({
        ...(params.ownerInputMeta ?? {}),
        note: params.ownerConfirmationNote || 'Owner verified via official portal interface.',
      }),
      resumedWorkflowState: resumedState,
      completedBy: params.actor,
      completedAt: new Date(),
    },
  });

  const pendingRemaining = await db.verificationCheckpoint.count({
    where: { projectId: cp.projectId, status: 'pending' },
  });
  if (pendingRemaining === 0) {
    await db.integrationProject.update({
      where: { id: cp.projectId },
      data: { status: 'setup_prepared' },
    });
  }

  await auditEvent({
    actor: params.actor,
    action: 'engineering.checkpoint.completed_resumed',
    target: `${cp.projectId}:${cp.providerKey}:${cp.checkpointType}`,
    providerKey: cp.providerKey,
    ip: params.ip,
    metadata: { checkpointId: cp.id, resumedWorkflowState: resumedState, pendingRemaining },
  });

  return { checkpoint: updatedCheckpoint, resumedWorkflowState: resumedState, pendingRemaining };
}
