import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFactoryAccess } from '@/lib/factory/tenancy';
import { getFirstPartyModule } from '@/lib/factory/modules/registry';
import {
  completeVoiceCallSession,
  getOrCreateVoicePolicy,
  processVoiceTurn,
  startVoiceCallSession,
  SUPPORTED_VOICE_LANGUAGES,
  updateVoicePolicy,
  upsertVoiceAgentProfile,
  upsertVoiceConsent,
} from '@/lib/factory/modules/voice-call-center';
import type { AiAdapterType, SupportedVoiceLanguage } from '@/lib/factory/ai-router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const access = await requireFactoryAccess(req, {
    workspaceId: req.nextUrl.searchParams.get('workspaceId'),
    permission: 'read',
  });
  if (!access.ok) return access.response;

  const wid = access.workspaceId;
  const [policy, consents, agents, calls] = await Promise.all([
    getOrCreateVoicePolicy(wid),
    db.voiceConsentRecord.findMany({ where: { workspaceId: wid }, orderBy: { updatedAt: 'desc' }, take: 200 }),
    db.voiceAgentProfile.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' } }),
    db.voiceCallSession.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);

  return NextResponse.json({
    module: getFirstPartyModule('voice_call_center'),
    workspaceId: wid,
    supportedLanguages: SUPPORTED_VOICE_LANGUAGES,
    policy,
    consents,
    agents,
    calls,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const action = String(body.action || '');
  const perm = action === 'start_call' || action === 'voice_turn' || action === 'complete_call' ? 'execute' : 'write';
  const access = await requireFactoryAccess(req, {
    workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
    permission: perm,
    requireCsrf: true,
  });
  if (!access.ok) return access.response;

  try {
    if (action === 'update_policy') {
      const policy = await updateVoicePolicy({
        workspaceId: access.workspaceId,
        timezone: body.timezone ? String(body.timezone) : undefined,
        allowedStartHour: typeof body.allowedStartHour === 'number' ? body.allowedStartHour : undefined,
        allowedEndHour: typeof body.allowedEndHour === 'number' ? body.allowedEndHour : undefined,
        requireExplicitConsent: typeof body.requireExplicitConsent === 'boolean' ? body.requireExplicitConsent : undefined,
        requireRecordingDisclosure: typeof body.requireRecordingDisclosure === 'boolean' ? body.requireRecordingDisclosure : undefined,
        defaultLanguage: body.defaultLanguage ? (String(body.defaultLanguage) as SupportedVoiceLanguage) : undefined,
        sipDomain: body.sipDomain !== undefined ? String(body.sipDomain) : undefined,
        sipTransport: body.sipTransport ? String(body.sipTransport) : undefined,
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ policy });
    }

    if (action === 'upsert_consent') {
      const consent = await upsertVoiceConsent({
        workspaceId: access.workspaceId,
        phoneE164: String(body.phoneE164 || ''),
        consentStatus: String(body.consentStatus || 'pending') as 'granted' | 'pending' | 'opted_out' | 'dnc',
        preferredLanguage: body.preferredLanguage ? (String(body.preferredLanguage) as SupportedVoiceLanguage) : 'bn',
        consentProof: body.consentProof ? String(body.consentProof) : undefined,
        optOutReason: body.optOutReason ? String(body.optOutReason) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json({ consent });
    }

    if (action === 'save_agent') {
      const agent = await upsertVoiceAgentProfile({
        workspaceId: access.workspaceId,
        name: String(body.name || ''),
        language: String(body.language || 'bn') as SupportedVoiceLanguage,
        greeting: String(body.greeting || ''),
        systemPrompt: String(body.systemPrompt || ''),
        sttAdapter: body.sttAdapter ? String(body.sttAdapter) : undefined,
        ttsAdapter: body.ttsAdapter ? String(body.ttsAdapter) : undefined,
        llmAdapter: body.llmAdapter ? (String(body.llmAdapter) as AiAdapterType) : undefined,
        providerKey: body.providerKey ? String(body.providerKey) : undefined,
        handoffTarget: body.handoffTarget ? String(body.handoffTarget) : undefined,
      });
      return NextResponse.json({ agent });
    }

    if (action === 'start_call') {
      const res = await startVoiceCallSession({
        workspaceId: access.workspaceId,
        agentId: body.agentId ? String(body.agentId) : undefined,
        direction: body.direction === 'inbound' ? 'inbound' : 'outbound',
        phoneE164: String(body.phoneE164 || ''),
        language: body.language ? (String(body.language) as SupportedVoiceLanguage) : undefined,
        telephonyAdapter: body.telephonyAdapter
          ? (String(body.telephonyAdapter) as 'sip_trunk' | 'external_provider' | 'mocked_telephony')
          : 'sip_trunk',
        providerKey: body.providerKey ? String(body.providerKey) : undefined,
        recordingEnabled: typeof body.recordingEnabled === 'boolean' ? body.recordingEnabled : true,
        testLocalHourOverride: typeof body.testLocalHourOverride === 'number' ? body.testLocalHourOverride : undefined,
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json(res, { status: res.allowed ? 201 : 422 });
    }

    if (action === 'voice_turn') {
      const res = await processVoiceTurn({
        workspaceId: access.workspaceId,
        sessionId: String(body.sessionId || ''),
        callerUtterance: String(body.callerUtterance || ''),
        llmAdapter: body.llmAdapter ? (String(body.llmAdapter) as AiAdapterType) : undefined,
        actor: access.user.username,
      });
      return NextResponse.json(res);
    }

    if (action === 'complete_call') {
      const session = await completeVoiceCallSession({
        workspaceId: access.workspaceId,
        sessionId: String(body.sessionId || ''),
        outcome: String(body.outcome || 'resolved') as
          | 'resolved'
          | 'follow_up_scheduled'
          | 'transferred_to_human'
          | 'voicemail'
          | 'opted_out',
        durationSeconds: Number(body.durationSeconds ?? 30),
        actor: access.user.username,
        ip: access.ip,
      });
      return NextResponse.json({ session });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Voice call center operation failed.' }, { status: 400 });
  }
}
