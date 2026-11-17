import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { db } from '@/lib/db';
import { getProviderByKey } from '@/lib/intelligence/catalog';
import { redactSecretText } from './vault-service';
import { auditEvent } from '@/lib/security/audit';

export type BrowserSessionStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'WAITING_FOR_OWNER'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED';

export interface BrowserCapabilityReport {
  playwrightAvailable: boolean;
  chromiumAvailable: boolean;
  chromiumPath: string | null;
  executionMode: 'isolated_browser' | 'guided_official_handoff';
  note: string;
}

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

export function detectBrowserRuntimeCapability(): BrowserCapabilityReport {
  let chromiumPath: string | null = null;
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (existsSync(/*turbopackIgnore: true*/ candidate)) {
      chromiumPath = candidate;
      break;
    }
  }
  if (!chromiumPath) {
    for (const bin of ['chromium', 'chromium-browser', 'google-chrome']) {
      try {
        const resolved = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (resolved) {
          chromiumPath = resolved;
          break;
        }
      } catch {
        // binary absent
      }
    }
  }

  const playwrightAvailable = existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ process.cwd(), 'node_modules', 'playwright'));

  const usable = playwrightAvailable && Boolean(chromiumPath);
  return {
    playwrightAvailable,
    chromiumAvailable: Boolean(chromiumPath),
    chromiumPath,
    executionMode: usable ? 'isolated_browser' : 'guided_official_handoff',
    note: usable
      ? 'Isolated Playwright/Chromium driver detected; runs strictly on official allowlisted URLs with owner approval gates.'
      : 'No local Chromium/Playwright driver is installed in this environment. Session orchestration enforces URL allowlisting, duplicate checks, and owner approval checkpoints via guided official portal handoff.',
  };
}

export function validateOfficialProviderUrl(providerKey: string, targetUrl: string): { ok: boolean; hostname?: string; reason?: string } {
  const provider = getProviderByKey(providerKey);
  if (!provider) return { ok: false, reason: 'Unknown provider.' };
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS official portal URLs are permitted.' };
  }

  const allowedHosts = new Set<string>();
  for (const url of [
    provider.officialWebsite,
    provider.officialDeveloperPortal,
    provider.officialApiDocumentation,
    provider.officialRegistrationUrl,
    provider.oauthConfig?.authUrl,
    ...provider.officialDocs.map(d => d.url),
  ]) {
    if (!url || url.includes('{')) continue;
    try {
      const h = new URL(url).hostname.toLowerCase();
      allowedHosts.add(h);
      const parts = h.split('.');
      if (parts.length >= 2) {
        allowedHosts.add(parts.slice(-2).join('.'));
      }
    } catch {
      // ignore template URLs
    }
  }

  const host = parsed.hostname.toLowerCase();
  const matched = Array.from(allowedHosts).some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  if (!matched) {
    return { ok: false, hostname: host, reason: `Host ${host} is outside verified official domains for ${provider.displayName}.` };
  }
  return { ok: true, hostname: host };
}

export async function checkDuplicateAccountRisk(tenantId: string, providerKey: string, ownerEmail: string) {
  const cleanEmail = ownerEmail.trim().toLowerCase();
  const [existingAccounts, existingWorkflows, existingBrowserSessions] = await Promise.all([
    db.integrationAccount.findMany({ where: { providerKey }, select: { id: true, businessName: true, verificationStatus: true } }),
    db.onboardingWorkflow.findUnique({ where: { clientId_providerKey: { clientId: tenantId, providerKey } } }),
    db.browserWorkflowSession.findMany({
      where: { clientId: tenantId, providerKey },
      select: { id: true, contextKey: true, status: true, updatedAt: true },
    }),
  ]);

  const matchingEmailSession = cleanEmail
    ? existingBrowserSessions.find(s => s.contextKey.toLowerCase().includes(cleanEmail))
    : undefined;

  return {
    duplicateRisk: existingAccounts.length > 0 || Boolean(matchingEmailSession) || Boolean(existingWorkflows && existingWorkflows.state !== 'NOT_STARTED'),
    existingAccountCount: existingAccounts.length,
    existingWorkflowState: existingWorkflows?.state ?? 'NOT_STARTED',
    matchingOwnerSessionId: matchingEmailSession?.id ?? null,
    recommendation: existingAccounts.length > 0
      ? 'An account record already exists for this provider; verify or reuse the existing official account instead of registering a duplicate.'
      : 'No duplicate onboarding record detected for this tenant and provider.',
  };
}

const FORBIDDEN_AUTOMATION_ACTIONS = [
  'bypass_captcha',
  'bypass_mfa',
  'intercept_email_password',
  'inject_third_party_login_script',
  'steal_session_cookie',
  'auto_submit_payment_method',
  'auto_accept_legal_terms',
];

export async function startBrowserWorkflowSession(params: {
  tenantId: string;
  providerKey: string;
  workflowType: 'account_setup' | 'developer_portal' | 'oauth_consent';
  ownerEmail: string;
  targetUrl?: string;
  actor: string;
  ip?: string;
}) {
  const provider = getProviderByKey(params.providerKey);
  if (!provider) throw new Error('Unknown provider key.');

  const defaultUrl = params.workflowType === 'developer_portal'
    ? provider.officialDeveloperPortal
    : params.workflowType === 'oauth_consent' && provider.oauthConfig && !provider.oauthConfig.authUrl.includes('{')
      ? provider.oauthConfig.authUrl
      : provider.officialRegistrationUrl || provider.officialWebsite;

  const targetUrl = params.targetUrl || defaultUrl;
  const check = validateOfficialProviderUrl(params.providerKey, targetUrl);
  if (!check.ok) {
    throw new Error(check.reason || 'Official domain validation failed.');
  }

  const runtime = detectBrowserRuntimeCapability();
  const duplicateCheck = await checkDuplicateAccountRisk(params.tenantId, params.providerKey, params.ownerEmail);

  const initialLog = [
    {
      at: new Date().toISOString(),
      event: 'session.initialized',
      mode: runtime.executionMode,
      officialUrl: targetUrl,
      allowedDomain: check.hostname,
      duplicateRisk: duplicateCheck.duplicateRisk,
      guardrails: 'CAPTCHA/MFA bypass, password capture, payment entry, and legal submission remain blocked pending explicit owner action.',
    },
  ];

  const session = await db.browserWorkflowSession.create({
    data: {
      clientId: params.tenantId,
      providerKey: params.providerKey,
      purpose: params.workflowType,
      status: 'WAITING_FOR_OWNER',
      officialUrl: targetUrl,
      contextKey: `${params.tenantId}:${params.providerKey}:${params.ownerEmail ? params.ownerEmail.trim().toLowerCase() : 'owner'}`,
      executionMode: runtime.executionMode,
      currentAction: duplicateCheck.duplicateRisk
        ? 'Duplicate check flagged existing record — confirm reuse or proceed in official portal'
        : `Ready for owner-supervised official portal step (${runtime.executionMode})`,
      nextOwnerAction:
        'Confirm you are signing into or registering with your authorized business email, and manually complete any CAPTCHA, MFA, legal consent, or billing steps on the official provider page.',
      auditNotes: JSON.stringify(initialLog),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'browser.session.start',
    target: `${params.tenantId}:${params.providerKey}:${session.id}`,
    providerKey: params.providerKey,
    ip: params.ip,
    metadata: { workflowType: params.workflowType, mode: runtime.executionMode, allowedDomain: check.hostname },
  });

  return {
    session,
    runtime,
    duplicateCheck,
    forbiddenAutomationActions: FORBIDDEN_AUTOMATION_ACTIONS,
  };
}

export async function updateBrowserWorkflowSessionControl(params: {
  sessionId: string;
  tenantId?: string;
  control: 'pause' | 'resume' | 'cancel' | 'approve_step' | 'complete';
  note?: string;
  actor: string;
  ip?: string;
}) {
  const existing = await db.browserWorkflowSession.findUnique({ where: { id: params.sessionId } });
  if (!existing) throw new Error('Browser workflow session not found.');
  if (params.tenantId && existing.clientId !== params.tenantId) {
    throw new Error('Cross-tenant browser session access denied.');
  }

  const nextStatusMap: Record<typeof params.control, BrowserSessionStatus> = {
    pause: 'PAUSED',
    resume: 'RUNNING',
    cancel: 'CANCELLED',
    approve_step: 'RUNNING',
    complete: 'COMPLETED',
  };
  const nextStatus = nextStatusMap[params.control];

  const existingLogs = (() => {
    try { return JSON.parse(existing.auditNotes) as Array<Record<string, unknown>>; } catch { return []; }
  })();

  existingLogs.push({
    at: new Date().toISOString(),
    control: params.control,
    actor: params.actor,
    note: redactSecretText(params.note || `Session transitioned to ${nextStatus}`),
  });

  const updated = await db.browserWorkflowSession.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      currentAction: redactSecretText(params.note || `State: ${nextStatus}`),
      nextOwnerAction: nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED' ? null : existing.nextOwnerAction,
      auditNotes: JSON.stringify(existingLogs.slice(-100)),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: `browser.session.${params.control}`,
    target: `${existing.clientId}:${existing.providerKey}:${existing.id}`,
    providerKey: existing.providerKey,
    ip: params.ip,
    metadata: { nextStatus },
  });

  return updated;
}
