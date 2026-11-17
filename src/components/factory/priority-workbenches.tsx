'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Mail,
  PhoneCall,
  Workflow,
  Briefcase,
  Play,
  ShieldAlert,
  UserCheck,
  RefreshCw,
} from 'lucide-react';

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ──────────────────────── 1. AI EMAIL MARKETING WORKBENCH ──────────────────────── */
export function EmailMarketingWorkbench({
  workspaceId,
  onNotify,
}: {
  workspaceId: string;
  onNotify: (msg: string, isErr?: boolean) => void;
}) {
  const [data, setData] = useState<{
    domains: { id: string; domain: string; spfStatus: string; dkimStatus: string; dmarcStatus: string; verifiedForProduction: boolean; reputationScore: number; sentCount: number; bounceCount: number }[];
    contacts: { id: string; email: string; fullName: string | null; segment: string; consentStatus: string; unsubscribeToken: string }[];
    templates: { id: string; name: string; subject: string; language: string }[];
    campaigns: { id: string; name: string; status: string; adapterType: string; approvalStatus: string; stats: string }[];
    deliveryEvents: { id: string; email: string; status: string; adapterUsed: string; detail: string | null; createdAt: string }[];
  } | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactConsent, setContactConsent] = useState<'granted' | 'pending'>('granted');
  const [tplName, setTplName] = useState('Monthly Briefing');
  const [tplSubject, setTplSubject] = useState('Updates from ALOAPI');
  const [tplBody, setTplBody] = useState('Hello, here is your verified update.');
  const [campName, setCampName] = useState('');
  const [campAdapter, setCampAdapter] = useState<'smtp_custom' | 'external_provider_bridge' | 'sandbox_mock_adapter'>('smtp_custom');
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [selectedTplId, setSelectedTplId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetchJson(`/api/factory/modules/email_marketing?workspaceId=${encodeURIComponent(workspaceId)}`);
      setData(res);
      if (!selectedDomainId && res.domains?.[0]?.id) setSelectedDomainId(res.domains[0].id);
      if (!selectedTplId && res.templates?.[0]?.id) setSelectedTplId(res.templates[0].id);
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  }, [workspaceId, selectedDomainId, selectedTplId, onNotify]);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/factory/modules/email_marketing?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => {
        if (!cancelled) {
          setData(res);
          setSelectedDomainId(prev => prev || res.domains?.[0]?.id || '');
          setSelectedTplId(prev => prev || res.templates?.[0]?.id || '');
        }
      })
      .catch(e => {
        if (!cancelled) onNotify((e as Error).message, true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, onNotify]);

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      await fetchJson('/api/factory/modules/email_marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      onNotify(okMsg);
      await load();
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  };

  if (!data) return <div className="p-6 text-xs text-slate-400">Loading AI Email Marketing workbench...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Mail className="w-4 h-4 text-cyan-400" /> Sending Domains &amp; Deliverability Gate (SPF / DKIM / DMARC)</h3>
          <button onClick={() => void load()} className="text-xs text-slate-300 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={domainInput} onChange={e => setDomainInput(e.target.value)} placeholder="mail.yourdomain.com" className="flex-1 min-w-[220px] rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white" />
          <button onClick={() => void act({ action: 'register_domain', domain: domainInput }, 'Registered sending domain.')} className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950">Add Domain</button>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {data.domains.length === 0 ? <p className="text-xs text-slate-400">No domains configured. Live sending stays blocked until SPF, DKIM, and DMARC pass.</p> : data.domains.map(d => (
            <div key={d.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <strong className="text-white">{d.domain}</strong>
                <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${d.verifiedForProduction ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {d.verifiedForProduction ? 'PROD VERIFIED' : 'NOT VERIFIED'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                SPF: {d.spfStatus} · DKIM: {d.dkimStatus} · DMARC: {d.dmarcStatus} · Reputation: {d.reputationScore}/100 ({d.bounceCount}/{d.sentCount} bounces)
              </div>
              <div className="flex gap-2">
                <button onClick={() => void act({ action: 'verify_domain', domainId: d.id }, 'Checked live DNS records.')} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200">Run DNS Check</button>
                <button onClick={() => void act({ action: 'verify_domain', domainId: d.id, spfVerified: true, dkimVerified: true, dmarcVerified: true }, 'Marked DNS records verified.')} className="rounded border border-emerald-500/40 px-2 py-1 text-[10px] text-emerald-300">Confirm TXT Records</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
          <h4 className="text-xs font-semibold text-white">Audience Contacts, Consent &amp; Suppression ({data.contacts.length})</h4>
          <div className="flex flex-wrap gap-2">
            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="recipient@example.com" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white" />
            <select value={contactConsent} onChange={e => setContactConsent(e.target.value as 'granted' | 'pending')} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white">
              <option value="granted">Consent: Granted</option>
              <option value="pending">Consent: Pending</option>
            </select>
            <button onClick={() => void act({ action: 'upsert_contact', email: contactEmail, consentStatus: contactConsent }, 'Saved email contact.')} className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950">Save</button>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {data.contacts.map(c => (
              <div key={c.id} className="flex justify-between items-center rounded bg-slate-950 px-2.5 py-1.5 text-[11px] border border-slate-800">
                <span className="text-slate-200">{c.email}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] ${c.consentStatus === 'granted' ? 'text-emerald-300' : 'text-amber-300'}`}>{c.consentStatus}</span>
                  {c.consentStatus === 'granted' && (
                    <button onClick={() => void act({ action: 'unsubscribe', unsubscribeToken: c.unsubscribeToken }, `Unsubscribed ${c.email}`)} className="text-[10px] text-red-300 underline">Unsubscribe</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
          <h4 className="text-xs font-semibold text-white">Email Template &amp; Campaign Dispatch</h4>
          <div className="grid grid-cols-2 gap-2">
            <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
            <input value={tplSubject} onChange={e => setTplSubject(e.target.value)} placeholder="Subject" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
          </div>
          <div className="flex gap-2">
            <input value={tplBody} onChange={e => setTplBody(e.target.value)} placeholder="Email body text" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
            <button onClick={() => void act({ action: 'save_template', name: tplName, subject: tplSubject, htmlBody: `<p>${tplBody}</p>`, textBody: tplBody }, 'Saved email template.')} className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-200">Save Template</button>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <input value={campName} onChange={e => setCampName(e.target.value)} placeholder="New campaign name" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
            <select value={campAdapter} onChange={e => setCampAdapter(e.target.value as 'smtp_custom' | 'external_provider_bridge' | 'sandbox_mock_adapter')} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white">
              <option value="smtp_custom">SMTP Custom (Vault)</option>
              <option value="external_provider_bridge">Authorized Provider Bridge</option>
              <option value="sandbox_mock_adapter">Sandbox Mock Adapter (Test Only)</option>
            </select>
            <select value={selectedDomainId} onChange={e => setSelectedDomainId(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white">
              <option value="">Select domain...</option>
              {data.domains.map(d => <option key={d.id} value={d.id}>{d.domain}</option>)}
            </select>
            <select value={selectedTplId} onChange={e => setSelectedTplId(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white">
              <option value="">Select template...</option>
              {data.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button onClick={() => void act({ action: 'create_campaign', name: campName || 'Campaign', domainId: selectedDomainId || undefined, templateId: selectedTplId || undefined, segment: 'all', adapterType: campAdapter }, 'Created campaign.')} className="w-full rounded bg-cyan-500 py-1.5 text-xs font-semibold text-slate-950">Create Campaign</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-white">Campaigns &amp; Delivery Audit ({data.campaigns.length})</h4>
        <div className="space-y-1.5">
          {data.campaigns.map(c => (
            <div key={c.id} className="flex flex-wrap justify-between items-center gap-2 rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
              <div>
                <strong className="text-white">{c.name}</strong>
                <span className="ml-2 text-[11px] font-mono text-cyan-300">{c.status} · {c.adapterType}</span>
                <div className="text-[11px] text-slate-400">{c.stats}</div>
              </div>
              <button onClick={() => void act({ action: 'dispatch_campaign', campaignId: c.id, approveNow: true }, `Dispatched ${c.name}`)} className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] text-emerald-200">
                <Play className="w-3 h-3" /> Approve &amp; Dispatch
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── 2. AI VOICE CALL CENTER WORKBENCH ──────────────────────── */
export function VoiceCallCenterWorkbench({
  workspaceId,
  onNotify,
}: {
  workspaceId: string;
  onNotify: (msg: string, isErr?: boolean) => void;
}) {
  const [data, setData] = useState<{
    policy: { timezone: string; allowedStartHour: number; allowedEndHour: number; defaultLanguage: string; requireRecordingDisclosure: boolean; sipDomain: string | null };
    supportedLanguages: { code: string; label: string; nativeName: string }[];
    consents: { id: string; phoneE164: string; consentStatus: string; preferredLanguage: string }[];
    agents: { id: string; name: string; language: string; llmAdapter: string }[];
    calls: { id: string; phoneE164: string; direction: string; language: string; status: string; recordingDisclosed: boolean; blockedReason: string | null; turnsJson: string; summary: string | null; outcome: string | null }[];
  } | null>(null);

  const [phone, setPhone] = useState('+8801711000001');
  const [lang, setLang] = useState('bn');
  const [consentState, setConsentState] = useState<'granted' | 'opted_out'>('granted');
  const [agentName, setAgentName] = useState('Dhaka Bangla Advisor');
  const [callAdapter, setCallAdapter] = useState<'sip_trunk' | 'external_provider' | 'mocked_telephony'>('sip_trunk');
  const [utterance, setUtterance] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetchJson(`/api/factory/modules/voice_call_center?workspaceId=${encodeURIComponent(workspaceId)}`);
      setData(res);
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  }, [workspaceId, onNotify]);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/factory/modules/voice_call_center?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(e => {
        if (!cancelled) onNotify((e as Error).message, true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, onNotify]);

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      await fetchJson('/api/factory/modules/voice_call_center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      onNotify(okMsg);
      await load();
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  };

  if (!data) return <div className="p-6 text-xs text-slate-400">Loading AI Voice Call Center workbench...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><PhoneCall className="w-4 h-4 text-cyan-400" /> Lawful Calling Policy &amp; Multilingual Support ({data.supportedLanguages.map(l => `${l.nativeName} (${l.code})`).join(' · ')})</h3>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-300">
            {data.policy.timezone} · {data.policy.allowedStartHour}:00–{data.policy.allowedEndHour}:00 · Disclosure: {data.policy.requireRecordingDisclosure ? 'Mandatory' : 'Optional'}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 pt-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
            <div className="font-semibold text-white">Consent / DNC Registry &amp; Call Launch</div>
            <div className="flex flex-wrap gap-2">
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+88017..." className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
              <select value={lang} onChange={e => setLang(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                {data.supportedLanguages.map(l => <option key={l.code} value={l.code}>{l.label} ({l.nativeName})</option>)}
              </select>
              <select value={consentState} onChange={e => setConsentState(e.target.value as 'granted' | 'opted_out')} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                <option value="granted">Consent: Granted</option>
                <option value="opted_out">Opt-Out / DNC</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void act({ action: 'upsert_consent', phoneE164: phone, consentStatus: consentState, preferredLanguage: lang }, 'Updated voice consent registry.')} className="rounded border border-slate-700 px-2.5 py-1 text-slate-200">Save Consent/DNC</button>
              <select value={callAdapter} onChange={e => setCallAdapter(e.target.value as 'sip_trunk' | 'external_provider' | 'mocked_telephony')} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white">
                <option value="sip_trunk">SIP Trunk (Vault Auth)</option>
                <option value="external_provider">Authorized Telephony Provider</option>
                <option value="mocked_telephony">Mocked Telephony (Test Only)</option>
              </select>
              <button onClick={() => void act({ action: 'start_call', direction: 'outbound', phoneE164: phone, language: lang, telephonyAdapter: callAdapter }, 'Started voice session.')} className="rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950">Start Outbound Call</button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
            <div className="font-semibold text-white">Multilingual AI Voice Agent Profile</div>
            <div className="flex gap-2">
              <input value={agentName} onChange={e => setAgentName(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" />
              <button onClick={() => void act({ action: 'save_agent', name: agentName, language: lang, greeting: lang === 'bn' ? 'আসসালামু আলাইকুম, আমি এলোএপিআই ভয়েস অ্যাসিস্ট্যান্ট।' : 'Hello, this is ALOAPI AI Voice Assistant.', systemPrompt: 'Helpful compliant bilingual support agent', llmAdapter: 'local_deterministic' }, 'Saved Voice Agent profile.')} className="rounded bg-slate-800 border border-cyan-500/40 px-2.5 py-1 text-cyan-200">Save Agent ({lang})</button>
            </div>
            <p className="text-[11px] text-slate-400">Agents configured: {data.agents.length} · Registered consent numbers: {data.consents.length}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
        <h4 className="text-xs font-semibold text-white">Call Sessions, Disclosures, Transcripts &amp; Human Handoff ({data.calls.length})</h4>
        <div className="space-y-2">
          {data.calls.map(c => (
            <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs space-y-1.5">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <strong className="text-white">{c.phoneE164}</strong>
                  <span className="ml-2 font-mono text-[11px] text-cyan-300">{c.direction} · {c.language} · {c.status}</span>
                  <span className="ml-2 text-[10px] text-slate-400">Disclosed: {c.recordingDisclosed ? 'YES' : 'NO'}</span>
                </div>
                {c.status === 'in_progress' && (
                  <div className="flex flex-wrap gap-1.5">
                    <input value={utterance} onChange={e => setUtterance(e.target.value)} placeholder="Caller says..." className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-white" />
                    <button onClick={() => void act({ action: 'voice_turn', sessionId: c.id, callerUtterance: utterance || 'আমি প্রতিনিধির সাথে কথা বলতে চাই' }, 'Processed AI voice turn.')} className="rounded bg-cyan-500 px-2 py-0.5 text-[10px] font-semibold text-slate-950">Send Turn</button>
                    <button onClick={() => void act({ action: 'complete_call', sessionId: c.id, outcome: 'resolved', durationSeconds: 45 }, 'Completed call & summarized.')} className="rounded bg-emerald-500/20 text-emerald-200 px-2 py-0.5 text-[10px]">Complete &amp; Summarize</button>
                  </div>
                )}
              </div>
              {c.blockedReason && <p className="text-[11px] text-red-300 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> {c.blockedReason}</p>}
              {c.summary && <p className="text-[11px] text-emerald-300">{c.summary}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── 3. VISUAL MARKETING AUTOMATION BUILDER ──────────────────────── */
export function AutomationBuilderWorkbench({
  workspaceId,
  onNotify,
}: {
  workspaceId: string;
  onNotify: (msg: string, isErr?: boolean) => void;
}) {
  const [data, setData] = useState<{
    workflows: { id: string; name: string; status: string; version: number; nodesJson: string; edgesJson: string }[];
    runs: { id: string; workflowId: string; status: string; attempts: number; stepLogsJson: string; lastError: string | null }[];
  } | null>(null);
  const [wfName, setWfName] = useState('Welcome & CRM Qualification Flow');

  const load = useCallback(async () => {
    try {
      const res = await fetchJson(`/api/factory/modules/marketing_automation?workspaceId=${encodeURIComponent(workspaceId)}`);
      setData(res);
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  }, [workspaceId, onNotify]);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/factory/modules/marketing_automation?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(e => {
        if (!cancelled) onNotify((e as Error).message, true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, onNotify]);

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      await fetchJson('/api/factory/modules/marketing_automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      onNotify(okMsg);
      await load();
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  };

  if (!data) return <div className="p-6 text-xs text-slate-400">Loading Automation Builder...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Workflow className="w-4 h-4 text-cyan-400" /> Visual Workflow DAG Builder (Triggers · Conditions · Actions · Checkpoints · Retries)</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={wfName} onChange={e => setWfName(e.target.value)} className="flex-1 min-w-[220px] rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white" />
          <button
            onClick={() => void act({
              action: 'save_workflow',
              name: wfName,
              triggerType: 'crm_lead_created',
              nodes: [
                { id: 'n1', type: 'trigger', label: 'Lead Created Trigger', position: { x: 40, y: 60 } },
                { id: 'n2', type: 'condition', label: 'Consent Granted?', config: { field: 'consentGranted', operator: 'equals', value: true }, position: { x: 240, y: 60 } },
                { id: 'n3', type: 'action', label: 'Generate AI Follow-up Copy', config: { actionType: 'ai.generate_copy', prompt: 'Welcome follow-up' }, position: { x: 440, y: 20 } },
                { id: 'n4', type: 'approval_checkpoint', label: 'Owner Outreach Checkpoint', position: { x: 640, y: 20 } },
                { id: 'n5', type: 'action', label: 'Create CRM Follow-up Lead', config: { actionType: 'crm.create_lead' }, position: { x: 840, y: 20 } },
              ],
              edges: [
                { source: 'n1', target: 'n2' },
                { source: 'n2', target: 'n3', branch: 'true' },
                { source: 'n3', target: 'n4' },
                { source: 'n4', target: 'n5' },
              ],
            }, 'Saved validated DAG workflow.')}
            className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
          >
            Deploy Visual DAG Workflow
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-white">Workflows ({data.workflows.length})</h4>
          {data.workflows.map(wf => {
            const nodes = JSON.parse(wf.nodesJson) as { id: string; type: string; label: string }[];
            return (
              <div key={wf.id} className="rounded border border-slate-800 bg-slate-950 p-3 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <strong className="text-white">{wf.name} (v{wf.version})</strong>
                  <button onClick={() => void act({ action: 'trigger', workflowId: wf.id, context: { consentGranted: true, contactName: 'Workflow Lead' } }, `Triggered ${wf.name}`)} className="rounded bg-cyan-500 px-2.5 py-1 text-[10px] font-semibold text-slate-950">Trigger Run</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nodes.map(n => (
                    <span key={n.id} className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300">{n.type}: {n.label}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-white">Execution History, Checkpoints &amp; Recovery ({data.runs.length})</h4>
          {data.runs.map(r => (
            <div key={r.id} className="rounded border border-slate-800 bg-slate-950 p-3 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-mono text-cyan-300">{r.status} (attempts: {r.attempts})</span>
                <div className="flex gap-1.5">
                  {r.status === 'awaiting_approval' && (
                    <>
                      <button onClick={() => void act({ action: 'decide_approval', runId: r.id, decision: 'approve' }, 'Approved workflow checkpoint.')} className="rounded bg-emerald-500/20 text-emerald-200 px-2 py-0.5 text-[10px]">Approve</button>
                      <button onClick={() => void act({ action: 'decide_approval', runId: r.id, decision: 'reject' }, 'Rejected workflow checkpoint.')} className="rounded bg-red-500/20 text-red-200 px-2 py-0.5 text-[10px]">Reject</button>
                    </>
                  )}
                  {(r.status === 'failed' || r.status === 'retrying') && (
                    <button onClick={() => void act({ action: 'recover_run', runId: r.id, markRecovered: true }, 'Recovered failed run.')} className="rounded bg-amber-500/20 text-amber-200 px-2 py-0.5 text-[10px]">Recover Run</button>
                  )}
                </div>
              </div>
              {r.lastError && <p className="text-[11px] text-red-300">{r.lastError}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── 4. FIRST-PARTY AI CRM WORKBENCH ──────────────────────── */
export function AiCrmWorkbench({
  workspaceId,
  onNotify,
}: {
  workspaceId: string;
  onNotify: (msg: string, isErr?: boolean) => void;
}) {
  const [data, setData] = useState<{
    stages: string[];
    orgs: { id: string; name: string; domain: string | null }[];
    contacts: { id: string; fullName: string; email: string | null; consentStatus: string; assignedTo: string | null }[];
    opportunities: { id: string; title: string; stage: string; valueUsd: number; probability: number; status: string }[];
    activities: { id: string; activityType: string; subject: string; body: string; actor: string; createdAt: string }[];
  } | null>(null);
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [oppTitle, setOppTitle] = useState('');
  const [oppValue, setOppValue] = useState('1200');

  const load = useCallback(async () => {
    try {
      const res = await fetchJson(`/api/factory/modules/ai_crm?workspaceId=${encodeURIComponent(workspaceId)}`);
      setData(res);
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  }, [workspaceId, onNotify]);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/factory/modules/ai_crm?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(e => {
        if (!cancelled) onNotify((e as Error).message, true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, onNotify]);

  const act = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      await fetchJson('/api/factory/modules/ai_crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      onNotify(okMsg);
      await load();
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  };

  if (!data) return <div className="p-6 text-xs text-slate-400">Loading isolated First-Party AI CRM...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
        <UserCheck className="w-4 h-4 shrink-0" />
        Isolated First-Party AI CRM: stores Factory workspace organizations, contacts, opportunities, and activity timelines without touching or modifying the legacy Marketing CRM.
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2 text-xs">
          <div className="font-semibold text-white">Organizations ({data.orgs.length})</div>
          <div className="flex gap-1.5">
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Org name" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
            <button onClick={() => void act({ action: 'create_org', name: orgName || 'Dhaka Enterprise' }, 'Created CRM organization.')} className="rounded bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950">Add</button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2 text-xs">
          <div className="font-semibold text-white">Contacts ({data.contacts.length})</div>
          <div className="flex gap-1.5">
            <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Contact name" className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Email" className="w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
            <button onClick={() => void act({ action: 'create_contact', fullName: contactName || 'New Contact', email: contactEmail || undefined, consentStatus: 'granted' }, 'Created CRM contact.')} className="rounded bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950">Add</button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2 text-xs">
          <div className="font-semibold text-white">Opportunities ({data.opportunities.length})</div>
          <div className="flex gap-1.5">
            <input value={oppTitle} onChange={e => setOppTitle(e.target.value)} placeholder="Deal title" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
            <input value={oppValue} onChange={e => setOppValue(e.target.value)} placeholder="$" className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
            <button onClick={() => void act({ action: 'create_opportunity', title: oppTitle || 'Enterprise Retainer', valueUsd: Number(oppValue) || 500, contactId: data.contacts[0]?.id }, 'Opened CRM opportunity.')} className="rounded bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950">Add</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-white flex items-center gap-2"><Briefcase className="w-4 h-4 text-cyan-400" /> Sales Pipeline &amp; Follow-Up Timeline</h4>
        {data.opportunities.map(o => (
          <div key={o.id} className="flex flex-wrap justify-between items-center gap-2 rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
            <div>
              <strong className="text-white">{o.title}</strong>
              <span className="ml-2 font-mono text-cyan-300">${o.valueUsd} · {o.stage} ({o.probability}%)</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {data.stages.map(st => (
                <button key={st} onClick={() => void act({ action: 'move_stage', opportunityId: o.id, stage: st }, `Moved ${o.title} -> ${st}`)} className={`px-2 py-0.5 rounded text-[10px] font-mono ${o.stage === st ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-300'}`}>{st}</button>
              ))}
            </div>
          </div>
        ))}
        <div className="pt-2 space-y-1">
          {data.activities.slice(0, 8).map(a => (
            <div key={a.id} className="text-[11px] text-slate-400 flex justify-between border-b border-slate-800/60 pb-1">
              <span><strong className="text-slate-200">{a.subject}</strong> — {a.body}</span>
              <span>{a.actor}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
