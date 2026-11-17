import { db } from '@/lib/db';
import { auditEvent } from '@/lib/security/audit';
import { resolveVaultSecretForServer } from '@/lib/onboarding/vault-service';
import { listFactoryProviderConnections } from '@/lib/factory/provider-bridge';
import { runFactoryAiInference, type AiAdapterType, type SupportedVoiceLanguage } from '@/lib/factory/ai-router';
import { recordFactoryUsage } from '@/lib/factory/billing';

export const SUPPORTED_VOICE_LANGUAGES: readonly { code: SupportedVoiceLanguage; label: string; nativeName: string }[] = [
  { code: 'bn', label: 'Bangla', nativeName: 'বাংলা' },
  { code: 'en', label: 'English', nativeName: 'English' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ar', label: 'Arabic', nativeName: 'العربية' },
  { code: 'es', label: 'Spanish', nativeName: 'Español' },
] as const;

export const DEFAULT_DISCLOSURE_SCRIPTS: Record<SupportedVoiceLanguage, string> = {
  bn: 'আসসালামু আলাইকুম। আপনার সেবার মান নিশ্চিত করতে এবং সহায়তার জন্য এই কলটি রেকর্ড করা হতে পারে।',
  en: 'Hello. To ensure service quality and assist with your request, this call may be recorded.',
  hi: 'नमस्ते। सेवा गुणवत्ता सुनिश्चित करने के लिए यह कॉल रिकॉर्ड की जा सकती है।',
  ar: 'مرحباً. لضمان جودة الخدمة والمساعدة في طلبك، قد يتم تسجيل هذه المكالمة.',
  es: 'Hola. Para garantizar la calidad del servicio, esta llamada puede ser grabada.',
};

function normalizeE164(raw: string): string {
  const cleaned = raw.trim().replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    throw new Error(`Phone number must follow E.164 format (e.g. +8801700000000), received: ${raw}`);
  }
  return cleaned;
}

function getLocalHourInTimezone(timezone: string, date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour')?.value ?? '12';
    return Number(hourPart) % 24;
  } catch {
    return date.getUTCHours();
  }
}

export async function getOrCreateVoicePolicy(workspaceId: string) {
  const existing = await db.voiceCompliancePolicy.findUnique({ where: { workspaceId } });
  if (existing) return existing;

  return db.voiceCompliancePolicy.create({
    data: {
      workspaceId,
      timezone: 'Asia/Dhaka',
      allowedStartHour: 9,
      allowedEndHour: 20,
      requireExplicitConsent: true,
      requireRecordingDisclosure: true,
      defaultLanguage: 'bn',
      disclosureScripts: JSON.stringify(DEFAULT_DISCLOSURE_SCRIPTS),
      sipTransport: 'TLS',
      maxDurationSeconds: 600,
    },
  });
}

export async function updateVoicePolicy(params: {
  workspaceId: string;
  timezone?: string;
  allowedStartHour?: number;
  allowedEndHour?: number;
  requireExplicitConsent?: boolean;
  requireRecordingDisclosure?: boolean;
  defaultLanguage?: SupportedVoiceLanguage;
  sipDomain?: string;
  sipTransport?: string;
  actor: string;
  ip?: string;
}) {
  const current = await getOrCreateVoicePolicy(params.workspaceId);
  const start = params.allowedStartHour ?? current.allowedStartHour;
  const end = params.allowedEndHour ?? current.allowedEndHour;
  if (start < 0 || start > 23 || end < 1 || end > 24 || start >= end) {
    throw new Error('Calling hours window must satisfy 0 <= allowedStartHour < allowedEndHour <= 24.');
  }

  const updated = await db.voiceCompliancePolicy.update({
    where: { workspaceId: params.workspaceId },
    data: {
      timezone: params.timezone || current.timezone,
      allowedStartHour: start,
      allowedEndHour: end,
      requireExplicitConsent: params.requireExplicitConsent ?? current.requireExplicitConsent,
      requireRecordingDisclosure: params.requireRecordingDisclosure ?? current.requireRecordingDisclosure,
      defaultLanguage: params.defaultLanguage || current.defaultLanguage,
      sipDomain: params.sipDomain !== undefined ? params.sipDomain : current.sipDomain,
      sipTransport: params.sipTransport || current.sipTransport,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.voice.policy.update',
    target: params.workspaceId,
    ip: params.ip,
    metadata: { timezone: updated.timezone, start, end, sipDomain: updated.sipDomain },
  });

  return updated;
}

export async function upsertVoiceConsent(params: {
  workspaceId: string;
  phoneE164: string;
  consentStatus: 'granted' | 'pending' | 'opted_out' | 'dnc';
  preferredLanguage?: SupportedVoiceLanguage;
  consentProof?: string;
  optOutReason?: string;
  actor: string;
}) {
  const phoneE164 = normalizeE164(params.phoneE164);
  const isOptOut = params.consentStatus === 'opted_out' || params.consentStatus === 'dnc';

  const record = await db.voiceConsentRecord.upsert({
    where: { workspaceId_phoneE164: { workspaceId: params.workspaceId, phoneE164 } },
    update: {
      consentStatus: params.consentStatus,
      preferredLanguage: params.preferredLanguage || 'bn',
      consentProof: params.consentProof,
      optedOutAt: isOptOut ? new Date() : null,
      optOutReason: isOptOut ? params.optOutReason || 'registered_opt_out' : null,
    },
    create: {
      workspaceId: params.workspaceId,
      phoneE164,
      consentStatus: params.consentStatus,
      preferredLanguage: params.preferredLanguage || 'bn',
      consentProof: params.consentProof,
      optedOutAt: isOptOut ? new Date() : null,
      optOutReason: isOptOut ? params.optOutReason || 'registered_opt_out' : null,
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.voice.consent.upsert',
    target: `${params.workspaceId}:${phoneE164}`,
    metadata: { consentStatus: params.consentStatus },
  });

  return record;
}

export async function upsertVoiceAgentProfile(params: {
  workspaceId: string;
  name: string;
  language: SupportedVoiceLanguage;
  greeting: string;
  systemPrompt: string;
  sttAdapter?: string;
  ttsAdapter?: string;
  llmAdapter?: AiAdapterType;
  providerKey?: string;
  handoffTarget?: string;
}) {
  if (!SUPPORTED_VOICE_LANGUAGES.some(l => l.code === params.language)) {
    throw new Error(`Unsupported language '${params.language}'. Supported: bn, en, hi, ar, es.`);
  }
  return db.voiceAgentProfile.upsert({
    where: { workspaceId_name: { workspaceId: params.workspaceId, name: params.name.trim() } },
    update: {
      language: params.language,
      greeting: params.greeting,
      systemPrompt: params.systemPrompt,
      sttAdapter: params.sttAdapter || 'local_deterministic',
      ttsAdapter: params.ttsAdapter || 'local_deterministic',
      llmAdapter: params.llmAdapter || 'local_deterministic',
      providerKey: params.providerKey || null,
      handoffTarget: params.handoffTarget || 'human_support_queue',
    },
    create: {
      workspaceId: params.workspaceId,
      name: params.name.trim(),
      language: params.language,
      greeting: params.greeting,
      systemPrompt: params.systemPrompt,
      sttAdapter: params.sttAdapter || 'local_deterministic',
      ttsAdapter: params.ttsAdapter || 'local_deterministic',
      llmAdapter: params.llmAdapter || 'local_deterministic',
      providerKey: params.providerKey || null,
      handoffTarget: params.handoffTarget || 'human_support_queue',
    },
  });
}

export async function startVoiceCallSession(params: {
  workspaceId: string;
  agentId?: string;
  direction: 'inbound' | 'outbound';
  phoneE164: string;
  language?: SupportedVoiceLanguage;
  telephonyAdapter?: 'sip_trunk' | 'external_provider' | 'mocked_telephony';
  providerKey?: string;
  recordingEnabled?: boolean;
  /** Optional hour (0-23) override used strictly by deterministic automated unit/runtime checks */
  testLocalHourOverride?: number;
  actor: string;
  ip?: string;
}) {
  const phoneE164 = normalizeE164(params.phoneE164);
  const policy = await getOrCreateVoicePolicy(params.workspaceId);
  const agent = params.agentId
    ? await db.voiceAgentProfile.findFirst({ where: { id: params.agentId, workspaceId: params.workspaceId } })
    : null;

  const language: SupportedVoiceLanguage =
    params.language || (agent?.language as SupportedVoiceLanguage) || (policy.defaultLanguage as SupportedVoiceLanguage) || 'bn';

  const telephonyAdapter = params.telephonyAdapter || 'sip_trunk';
  const recordingEnabled = params.recordingEnabled ?? true;

  // 1. DNC / Opt-Out & Consent Verification
  const consentRecord = await db.voiceConsentRecord.findUnique({
    where: { workspaceId_phoneE164: { workspaceId: params.workspaceId, phoneE164 } },
  });

  if (consentRecord && (consentRecord.consentStatus === 'opted_out' || consentRecord.consentStatus === 'dnc')) {
    const blocked = await db.voiceCallSession.create({
      data: {
        workspaceId: params.workspaceId,
        agentId: agent?.id,
        direction: params.direction,
        phoneE164,
        language,
        status: 'blocked_compliance',
        telephonyAdapter,
        providerKey: params.providerKey,
        consentVerified: false,
        callingHoursVerified: false,
        recordingEnabled: false,
        recordingDisclosed: false,
        blockedReason: `Blocked: recipient status is '${consentRecord.consentStatus}' (${consentRecord.optOutReason || 'DNC/opt-out'}).`,
        endedAt: new Date(),
      },
    });
    return { allowed: false, session: blocked, reason: blocked.blockedReason };
  }

  const consentVerified =
    params.direction === 'inbound' ||
    !policy.requireExplicitConsent ||
    consentRecord?.consentStatus === 'granted';

  if (!consentVerified) {
    const blocked = await db.voiceCallSession.create({
      data: {
        workspaceId: params.workspaceId,
        agentId: agent?.id,
        direction: params.direction,
        phoneE164,
        language,
        status: 'blocked_compliance',
        telephonyAdapter,
        providerKey: params.providerKey,
        consentVerified: false,
        callingHoursVerified: false,
        recordingEnabled: false,
        recordingDisclosed: false,
        blockedReason: 'Blocked: explicit calling consent has not been granted for outbound call.',
        endedAt: new Date(),
      },
    });
    return { allowed: false, session: blocked, reason: blocked.blockedReason };
  }

  // 2. Lawful Calling Hours Check (for outbound calls)
  const localHour =
    typeof params.testLocalHourOverride === 'number'
      ? params.testLocalHourOverride
      : getLocalHourInTimezone(policy.timezone);
  const hoursValid =
    params.direction === 'inbound' ||
    (localHour >= policy.allowedStartHour && localHour < policy.allowedEndHour);

  if (!hoursValid) {
    const blocked = await db.voiceCallSession.create({
      data: {
        workspaceId: params.workspaceId,
        agentId: agent?.id,
        direction: params.direction,
        phoneE164,
        language,
        status: 'blocked_compliance',
        telephonyAdapter,
        providerKey: params.providerKey,
        consentVerified: true,
        callingHoursVerified: false,
        recordingEnabled: false,
        recordingDisclosed: false,
        blockedReason: `Blocked: local hour ${localHour}:00 in ${policy.timezone} is outside permitted calling hours (${policy.allowedStartHour}:00-${policy.allowedEndHour}:00).`,
        endedAt: new Date(),
      },
    });
    return { allowed: false, session: blocked, reason: blocked.blockedReason };
  }

  // 3. Telephony Adapter Check (never bypass carrier/provider requirements)
  if (telephonyAdapter === 'sip_trunk') {
    if (!policy.sipDomain) {
      throw new Error('SIP trunk calling requires policy.sipDomain and SIP credentials configured first.');
    }
    const sipCred = await resolveVaultSecretForServer({
      tenantId: params.workspaceId,
      providerKey: 'sip_trunk',
      credentialType: 'custom_secret',
      label: 'sip_password',
      actor: params.actor,
      reason: 'Outbound/Inbound SIP call authentication',
    });
    if (!sipCred) {
      throw new Error('SIP trunk calling requires Vault SIP credential (providerKey=sip_trunk, label=sip_password).');
    }
  } else if (telephonyAdapter === 'external_provider') {
    if (!params.providerKey) throw new Error('external_provider adapter requires providerKey.');
    const conns = await listFactoryProviderConnections(params.workspaceId, 'voice_call_center');
    const active = conns.find(c => c.providerKey === params.providerKey && c.status === 'authorized_with_vault');
    if (!active) {
      throw new Error(`Telephony provider '${params.providerKey}' is not authorized with active Vault credentials.`);
    }
  }

  // 4. Mandatory Recording Disclosure before recording commences
  const disclosures = (() => {
    try {
      return JSON.parse(policy.disclosureScripts) as Record<string, string>;
    } catch {
      return DEFAULT_DISCLOSURE_SCRIPTS;
    }
  })();
  const disclosureText = disclosures[language] || DEFAULT_DISCLOSURE_SCRIPTS[language] || DEFAULT_DISCLOSURE_SCRIPTS.en;
  const recordingDisclosed = !recordingEnabled || !policy.requireRecordingDisclosure || Boolean(disclosureText);

  const initialTurns: { speaker: string; language: SupportedVoiceLanguage; text: string; timestamp: string }[] = [];
  if (recordingEnabled && policy.requireRecordingDisclosure) {
    initialTurns.push({
      speaker: 'system_disclosure',
      language,
      text: disclosureText,
      timestamp: new Date().toISOString(),
    });
  }
  initialTurns.push({
    speaker: 'ai_agent',
    language,
    text: agent?.greeting || disclosureText,
    timestamp: new Date().toISOString(),
  });

  const session = await db.voiceCallSession.create({
    data: {
      workspaceId: params.workspaceId,
      agentId: agent?.id,
      direction: params.direction,
      phoneE164,
      language,
      status: 'in_progress',
      telephonyAdapter: telephonyAdapter === 'mocked_telephony' ? 'mocked_telephony (MOCKED)' : telephonyAdapter,
      providerKey: params.providerKey || null,
      consentVerified: true,
      callingHoursVerified: true,
      recordingEnabled,
      recordingDisclosed,
      disclosurePlayedAt: recordingEnabled ? new Date() : null,
      turnsJson: JSON.stringify(initialTurns),
    },
  });

  await auditEvent({
    actor: params.actor,
    action: 'factory.voice.call.start',
    target: `${params.workspaceId}:${session.id}`,
    ip: params.ip,
    metadata: { direction: params.direction, language, telephonyAdapter: session.telephonyAdapter, recordingDisclosed },
  });

  return { allowed: true, session };
}

export async function processVoiceTurn(params: {
  workspaceId: string;
  sessionId: string;
  callerUtterance: string;
  llmAdapter?: AiAdapterType;
  actor: string;
}) {
  const session = await db.voiceCallSession.findFirst({
    where: { id: params.sessionId, workspaceId: params.workspaceId },
    include: { agent: true },
  });
  if (!session) throw new Error('Call session not found.');
  if (session.status !== 'in_progress') {
    throw new Error(`Cannot process turn when call status is '${session.status}'.`);
  }

  const turns = (() => {
    try { return JSON.parse(session.turnsJson) as { speaker: string; language: string; text: string; timestamp: string }[]; }
    catch { return []; }
  })();

  turns.push({
    speaker: 'caller',
    language: session.language,
    text: params.callerUtterance.trim(),
    timestamp: new Date().toISOString(),
  });

  const ai = await runFactoryAiInference({
    workspaceId: params.workspaceId,
    moduleKey: 'voice_call_center',
    task: 'voice_reply',
    language: session.language as SupportedVoiceLanguage,
    prompt: params.callerUtterance,
    adapter: params.llmAdapter || (session.agent?.llmAdapter as AiAdapterType) || 'local_deterministic',
    actor: params.actor,
  });

  turns.push({
    speaker: 'ai_agent',
    language: session.language,
    text: ai.outputText,
    timestamp: new Date().toISOString(),
  });

  const handoff = Boolean(ai.structured.handoffRecommended);
  const updated = await db.voiceCallSession.update({
    where: { id: session.id },
    data: {
      turnsJson: JSON.stringify(turns),
      sentiment: String(ai.structured.sentiment || 'neutral'),
      status: handoff ? 'transferred_to_human' : 'in_progress',
      handoffReason: handoff ? 'Caller requested human agent or urgent issue detected' : null,
      endedAt: handoff ? new Date() : null,
    },
  });

  return { session: updated, aiReply: ai.outputText, handoffTriggered: handoff };
}

export async function completeVoiceCallSession(params: {
  workspaceId: string;
  sessionId: string;
  outcome: 'resolved' | 'follow_up_scheduled' | 'transferred_to_human' | 'voicemail' | 'opted_out';
  durationSeconds: number;
  actor: string;
  ip?: string;
}) {
  const session = await db.voiceCallSession.findFirst({
    where: { id: params.sessionId, workspaceId: params.workspaceId },
  });
  if (!session) throw new Error('Call session not found.');

  const turns = (() => {
    try { return JSON.parse(session.turnsJson) as { speaker: string; text: string }[]; }
    catch { return []; }
  })();

  const summaryAi = await runFactoryAiInference({
    workspaceId: params.workspaceId,
    moduleKey: 'voice_call_center',
    task: 'call_summary',
    language: session.language as SupportedVoiceLanguage,
    prompt: `Summarize call outcome=${params.outcome}`,
    context: { turns },
    actor: params.actor,
  });

  const minutes = Math.max(0.1, Number((params.durationSeconds / 60).toFixed(2)));
  const isMock = session.telephonyAdapter.includes('MOCKED');
  const costUsd = isMock ? 0 : Number((minutes * 0.015).toFixed(4));

  const updated = await db.voiceCallSession.update({
    where: { id: session.id },
    data: {
      status: params.outcome === 'transferred_to_human' ? 'transferred_to_human' : 'completed',
      outcome: params.outcome,
      durationSeconds: Math.max(1, params.durationSeconds),
      summary: summaryAi.outputText,
      sentiment: String(summaryAi.structured.sentiment || session.sentiment || 'neutral'),
      costUsd,
      endedAt: new Date(),
    },
  });

  await recordFactoryUsage({
    workspaceId: params.workspaceId,
    moduleKey: 'voice_call_center',
    metric: 'voice_minute',
    quantity: minutes,
    unitCostUsd: isMock ? 0 : 0.015,
    adapter: session.telephonyAdapter,
    metadata: { callId: session.id, language: session.language, outcome: params.outcome },
  });

  if (params.outcome === 'opted_out') {
    await upsertVoiceConsent({
      workspaceId: params.workspaceId,
      phoneE164: session.phoneE164,
      consentStatus: 'opted_out',
      optOutReason: 'caller_requested_opt_out_during_call',
      actor: params.actor,
    });
  }

  await auditEvent({
    actor: params.actor,
    action: 'factory.voice.call.complete',
    target: `${params.workspaceId}:${session.id}`,
    ip: params.ip,
    metadata: { outcome: params.outcome, durationSeconds: updated.durationSeconds, costUsd },
  });

  return updated;
}
