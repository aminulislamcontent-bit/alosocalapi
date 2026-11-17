'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2, ShieldCheck, BookOpen, RefreshCw } from 'lucide-react';
import { EmailMarketingWorkbench, VoiceCallCenterWorkbench, AutomationBuilderWorkbench, AiCrmWorkbench } from './priority-workbenches';

interface ModuleMeta {
  key: string;
  order: number;
  name: string;
  tier: string;
  category: string;
  summary: string;
  appRoute: string;
  apiEndpoint: string;
  compatibleExternalProviders: string[];
  complianceGuardrails: string[];
  operationalDocs: { architecture: string; prerequisites: string[]; runbookSteps: string[]; safetyNotes: string[] };
}

export function ModuleSuiteWorkbench({
  moduleKey,
  workspaceId,
  onNotify,
}: {
  moduleKey: string;
  workspaceId: string;
  onNotify: (msg: string, isErr?: boolean) => void;
}) {
  const [state, setState] = useState<{
    module: ModuleMeta;
    records: { id: string; recordType: string; title: string; status: string; data: string; createdAt: string }[];
    connections: { id: string; providerKey: string; status: string; approvedBy: string | null }[];
    computedSummary: Record<string, unknown>;
  } | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [detailInput, setDetailInput] = useState('');
  const [language, setLanguage] = useState<'bn' | 'en' | 'hi' | 'ar' | 'es'>('en');
  const [extraValue, setExtraValue] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [explicitConsent, setExplicitConsent] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/factory/modules/${encodeURIComponent(moduleKey)}?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load module');
      setState(data);
      if (!selectedProvider && data.module?.compatibleExternalProviders?.[0]) {
        setSelectedProvider(data.module.compatibleExternalProviders[0]);
      }
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  }, [moduleKey, workspaceId, selectedProvider, onNotify]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/factory/modules/${encodeURIComponent(moduleKey)}?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load module');
        if (!cancelled) {
          setState(data);
          setSelectedProvider(prev => prev || data.module?.compatibleExternalProviders?.[0] || '');
        }
      })
      .catch(e => {
        if (!cancelled) onNotify((e as Error).message, true);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleKey, workspaceId, onNotify]);

  if (moduleKey === 'email_marketing') return <EmailMarketingWorkbench workspaceId={workspaceId} onNotify={onNotify} />;
  if (moduleKey === 'voice_call_center') return <VoiceCallCenterWorkbench workspaceId={workspaceId} onNotify={onNotify} />;
  if (moduleKey === 'marketing_automation') return <AutomationBuilderWorkbench workspaceId={workspaceId} onNotify={onNotify} />;
  if (moduleKey === 'ai_crm') return <AiCrmWorkbench workspaceId={workspaceId} onNotify={onNotify} />;

  if (!state) return <div className="p-6 text-xs text-slate-400">Loading {moduleKey} module...</div>;

  const submitAction = async () => {
    try {
      const data: Record<string, unknown> = {
        topic: detailInput || titleInput,
        question: detailInput || titleInput,
        keyword: titleInput,
        concept: titleInput,
        headline: titleInput,
        subheadline: detailInput,
        message: detailInput || titleInput,
        senderId: extraValue || 'ALOAPI',
        templateName: (titleInput || 'utility_notice').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        category: 'UTILITY',
        bodyText: detailInput || titleInput,
        reviewText: detailInput || titleInput,
        rating: Number(extraValue) || 5,
        dailyBudgetUsd: Number(extraValue) || 50,
        consentGranted: true,
        consentChecked: true,
        saleUsd: Number(extraValue) || 100,
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        endTime: new Date(Date.now() + 5400_000).toISOString(),
      };
      const res = await fetch(`/api/factory/modules/${encodeURIComponent(moduleKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'execute',
          title: titleInput || `${state.module.name} Item`,
          language,
          data,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      onNotify(`Saved item in ${state.module.name}.`);
      setTitleInput('');
      setDetailInput('');
      await load();
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  };

  const connectExternal = async () => {
    try {
      const res = await fetch('/api/factory/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          moduleKey,
          providerKey: selectedProvider,
          explicitOwnerConsent: explicitConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to bind provider');
      onNotify(`Bound ${selectedProvider} (${data.connection.status}).`);
      await load();
    } catch (e) {
      onNotify((e as Error).message, true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div>
            <h3 className="text-base font-semibold text-white">#{state.module.order} {state.module.name}</h3>
            <p className="text-xs text-slate-400">{state.module.summary}</p>
          </div>
          <button onClick={() => void load()} className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-200 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2 text-xs">
          <div className="font-semibold text-white">Create / Execute Domain Action</div>
          <div className="grid gap-2 sm:grid-cols-4">
            <input value={titleInput} onChange={e => setTitleInput(e.target.value)} placeholder="Title / Keyword / Template" className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white" />
            <input value={detailInput} onChange={e => setDetailInput(e.target.value)} placeholder="Body / Message / Review / Prompt" className="sm:col-span-2 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white" />
            <select value={language} onChange={e => setLanguage(e.target.value as 'bn' | 'en' | 'hi' | 'ar' | 'es')} className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-white">
              <option value="en">English (en)</option>
              <option value="bn">Bangla (bn)</option>
              <option value="hi">Hindi (hi)</option>
              <option value="ar">Arabic (ar)</option>
              <option value="es">Spanish (es)</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={extraValue} onChange={e => setExtraValue(e.target.value)} placeholder="Sender ID / Budget / Rating / Sale ($)" className="w-60 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-white" />
            <button onClick={() => void submitAction()} className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-slate-950">Run &amp; Save</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-white">Module Records ({state.records.length})</h4>
          {state.records.length === 0 ? <p className="text-xs text-slate-400">No records in this workspace yet.</p> : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {state.records.map(r => (
                <div key={r.id} className="rounded border border-slate-800 bg-slate-950 p-2.5 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <strong className="text-white">{r.title}</strong>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-cyan-300">{r.status}</span>
                      {r.status !== 'approved' && (
                        <button
                          onClick={async () => {
                            await fetch(`/api/factory/modules/${encodeURIComponent(moduleKey)}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ workspaceId, action: 'approve', recordId: r.id }),
                            });
                            onNotify('Approved record.');
                            await load();
                          }}
                          className="rounded border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-300 inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </button>
                      )}
                    </div>
                  </div>
                  <pre className="text-[10px] text-slate-400 whitespace-pre-wrap break-all">{r.data.slice(0, 260)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
            <h4 className="font-semibold text-white flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5 text-cyan-400" /> Explicit External Provider Connection (Layer 2 -&gt; Layer 1)</h4>
            <div className="flex flex-wrap gap-2">
              <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white">
                {state.module.compatibleExternalProviders.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <input type="checkbox" checked={explicitConsent} onChange={e => setExplicitConsent(e.target.checked)} />
                Explicit owner consent
              </label>
              <button onClick={() => void connectExternal()} className="rounded bg-slate-800 border border-cyan-500/40 px-2.5 py-1 text-cyan-200">Bind Provider</button>
            </div>
            {state.connections.map(c => (
              <div key={c.id} className="text-[11px] text-slate-300 flex justify-between bg-slate-950 rounded px-2 py-1 border border-slate-800">
                <span>{c.providerKey}</span>
                <span className="font-mono text-cyan-300">{c.status}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-1.5 text-[11px]">
            <h4 className="text-xs font-semibold text-white flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-cyan-400" /> Compliance &amp; Operational Runbook</h4>
            <p className="text-slate-300">{state.module.operationalDocs.architecture}</p>
            <div className="text-amber-300 flex items-start gap-1"><ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {state.module.complianceGuardrails.join(' · ')}</div>
            <div className="text-slate-400">Summary: {JSON.stringify(state.computedSummary)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
