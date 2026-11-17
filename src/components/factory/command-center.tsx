'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  RefreshCw,
  ShieldCheck,
  Database,
  Activity,
  Download,
  ExternalLink,
  Bot,
  Users,
} from 'lucide-react';
import { ModuleSuiteWorkbench } from './module-suite-workbench';

interface FactoryOverview {
  apiVersion: string;
  activeWorkspaceId: string;
  currentRole: string;
  externalCatalogSummary: { total: number; marketingPlatformCount: number; oauthSupportedCount: number };
  workspaces: { id: string; slug: string; name: string; planTier: string }[];
  members: { id: string; username: string; role: string; status: string }[];
  modules: {
    key: string;
    order: number;
    name: string;
    shortName: string;
    tier: string;
    category: string;
    appRoute: string;
    itemCount: number;
    authorizedProvidersCount: number;
    operationalStatus: string;
  }[];
  connections: { id: string; moduleKey: string; providerKey: string; status: string }[];
  jobsSummary: {
    total: number;
    queued: number;
    deadLetter: number;
    completed: number;
    recent: { id: string; moduleKey: string; jobType: string; status: string; attempts: number; lastError: string | null }[];
  };
  usageSummary: {
    planTier: string;
    billingPeriod: string;
    usage: { emailSentThisMonth: number; voiceMinutesThisMonth: number; aiTokensThisMonth: number; totalCostUsd: number };
    limits: { monthlyEmailQuota: number; monthlyVoiceMinutesQuota: number; monthlyAiTokensQuota: number };
  };
  emailHealth: { verifiedDomains: number; domains: { id: string }[]; campaigns: { id: string }[] };
  voiceHealth: { calls: { id: string }[]; blockedCalls: number };
  automationHealth: { workflows: { id: string }[]; awaitingApproval: number };
  auditEvents: { id: string; actor: string; action: string; detail: string; createdAt: string }[];
}

export default function CommandCenter({
  initialModuleKey,
  onToast,
}: {
  initialModuleKey?: string;
  onToast?: (msg: string, type?: string) => void;
}) {
  const [workspaceId, setWorkspaceId] = useState('default-workspace');
  const [overview, setOverview] = useState<FactoryOverview | null>(null);
  const [activeSection, setActiveSection] = useState<'grid' | 'module' | 'infra' | 'rbac' | 'audit'>(
    initialModuleKey ? 'module' : 'grid',
  );
  const [selectedModule, setSelectedModule] = useState<string>(initialModuleKey || 'email_marketing');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Infra / RBAC forms
  const [newWsSlug, setNewWsSlug] = useState('');
  const [newWsName, setNewWsName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState<'owner' | 'admin' | 'operator' | 'analyst' | 'viewer'>('operator');
  const [aiPrompt, setAiPrompt] = useState('Write a compliant launch announcement for Dhaka customers.');
  const [aiLang, setAiLang] = useState<'bn' | 'en' | 'hi' | 'ar' | 'es'>('bn');
  const [aiOutput, setAiOutput] = useState<string | null>(null);

  const notify = useCallback(
    (msg: string, isErr = false) => {
      if (onToast) onToast(msg, isErr ? 'error' : 'success');
    },
    [onToast],
  );

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch(`/api/factory/overview?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Platform Factory Command Center');
      setOverview(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load factory overview');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/factory/overview?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load Platform Factory Command Center');
        if (!cancelled) {
          setOverview(data);
          setError(null);
        }
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load factory overview');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (loading && !overview) {
    return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading ALOAPI First-Party Platform Factory...</div>;
  }

  if (error || !overview) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-200 space-y-2">
        <div>{error || 'Command center unavailable.'}</div>
        <Link href="/" className="inline-block text-xs text-cyan-300 underline">Sign in via ALOAPI Gateway &rarr;</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            ALOAPI First-Party Platform Factory &amp; Admin Command Center
          </h2>
          <p className="text-xs text-slate-400">
            20 Independent First-Party Modules · Isolated from External Catalog ({overview.externalCatalogSummary.total} External Providers) · Role: {overview.currentRole}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={workspaceId}
            onChange={e => setWorkspaceId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
            aria-label="Select Factory Workspace"
          >
            {overview.workspaces.map(w => (
              <option key={w.id} value={w.id}>{w.name} ({w.planTier})</option>
            ))}
          </select>
          <a
            href={`/api/factory/portability?workspaceId=${encodeURIComponent(workspaceId)}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-200 hover:border-cyan-400"
          >
            <Download className="w-3.5 h-3.5" /> Backup Export (No Secrets)
          </a>
          <button
            onClick={() => void loadOverview()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-200 hover:border-cyan-400"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
          <div className="text-[11px] text-slate-400">First-Party Modules</div>
          <div className="text-2xl font-bold text-white">{overview.modules.length}</div>
          <div className="text-[11px] text-cyan-300">4 Priority + 16 Specialized</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
          <div className="text-[11px] text-slate-400">External Catalog Bridge</div>
          <div className="text-2xl font-bold text-white">{overview.connections.length}</div>
          <div className="text-[11px] text-cyan-300">{overview.externalCatalogSummary.total} external providers</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
          <div className="text-[11px] text-slate-400">Email &amp; Telephony Health</div>
          <div className="text-2xl font-bold text-white">{overview.emailHealth.verifiedDomains}/{overview.emailHealth.domains.length}</div>
          <div className="text-[11px] text-amber-300">{overview.voiceHealth.blockedCalls} compliance-blocked call(s)</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
          <div className="text-[11px] text-slate-400">Background Jobs / DLQ</div>
          <div className="text-2xl font-bold text-white">{overview.jobsSummary.queued} / {overview.jobsSummary.deadLetter}</div>
          <div className="text-[11px] text-emerald-300">{overview.jobsSummary.completed} completed</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
          <div className="text-[11px] text-slate-400">Usage &amp; Cost ({overview.usageSummary.billingPeriod})</div>
          <div className="text-2xl font-bold text-white">${overview.usageSummary.usage.totalCostUsd.toFixed(4)}</div>
          <div className="text-[11px] text-cyan-300">{overview.usageSummary.usage.aiTokensThisMonth} AI tokens</div>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2 text-xs">
        {[
          { id: 'grid', label: 'All 20 Modules Directory' },
          { id: 'module', label: `Active Module Workbench (${selectedModule})` },
          { id: 'infra', label: 'Shared Infra: Jobs, AI Router & Billing' },
          { id: 'rbac', label: 'Workspaces & RBAC Permissions' },
          { id: 'audit', label: 'Factory Security & Audit Stream' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as typeof activeSection)}
            className={`px-3 py-1.5 rounded-lg font-medium ${activeSection === tab.id ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-950 text-slate-300 border border-slate-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'grid' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {overview.modules.map(m => (
            <div key={m.key} className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">#{m.order} · {m.tier === 'priority_production' ? 'PRIORITY' : 'MODULE'}</span>
                  <span className="text-[10px] font-mono text-emerald-300">{m.operationalStatus}</span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white">{m.name}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{m.category}</p>
                <div className="mt-2 text-[11px] text-slate-300">Records/Runs: <strong>{m.itemCount}</strong> · Authorized Ext: <strong>{m.authorizedProvidersCount}</strong></div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setSelectedModule(m.key); setActiveSection('module'); }}
                  className="flex-1 rounded-lg bg-cyan-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950"
                >
                  Open Workbench
                </button>
                <Link href={m.appRoute} className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:border-cyan-400" title={`Dedicated route ${m.appRoute}`}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'module' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {overview.modules.map(m => (
              <button
                key={m.key}
                onClick={() => setSelectedModule(m.key)}
                className={`px-2.5 py-1 rounded text-[11px] ${selectedModule === m.key ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}
              >
                {m.order}. {m.shortName}
              </button>
            ))}
          </div>
          <ModuleSuiteWorkbench moduleKey={selectedModule} workspaceId={workspaceId} onNotify={notify} />
        </div>
      )}

      {activeSection === 'infra' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-white flex items-center gap-1.5"><Activity className="w-4 h-4 text-cyan-400" /> Background Job Queue &amp; Dead-Letter Recovery</h3>
              <button
                onClick={async () => {
                  const res = await fetch('/api/factory/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId, action: 'run_due' }),
                  });
                  const d = await res.json();
                  notify(`Processed ${d.processedCount ?? 0} due job(s).`);
                  await loadOverview();
                }}
                className="rounded bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950"
              >
                Process Due Jobs
              </button>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {overview.jobsSummary.recent.length === 0 ? <p className="text-slate-400">No background jobs queued yet.</p> : overview.jobsSummary.recent.map(j => (
                <div key={j.id} className="rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5 flex justify-between items-center">
                  <span><strong className="text-white">{j.jobType}</strong> ({j.moduleKey})</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-cyan-300">{j.status}</span>
                    {j.status === 'dead_letter' && (
                      <button
                        onClick={async () => {
                          await fetch('/api/factory/jobs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ workspaceId, action: 'retry_dlq', jobId: j.id }),
                          });
                          notify('Retried dead-letter job.');
                          await loadOverview();
                        }}
                        className="text-[10px] text-amber-300 underline"
                      >
                        Retry DLQ
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
            <h3 className="font-semibold text-white flex items-center gap-1.5"><Bot className="w-4 h-4 text-cyan-400" /> AI Model Router (Local Deterministic / Ollama / Vault OpenAI-Compatible)</h3>
            <div className="flex flex-wrap gap-2">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white" />
              <select value={aiLang} onChange={e => setAiLang(e.target.value as 'bn' | 'en' | 'hi' | 'ar' | 'es')} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white">
                <option value="bn">Bangla (bn)</option>
                <option value="en">English (en)</option>
                <option value="hi">Hindi (hi)</option>
                <option value="ar">Arabic (ar)</option>
                <option value="es">Spanish (es)</option>
              </select>
              <button
                onClick={async () => {
                  const res = await fetch('/api/factory/ai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId, task: 'marketing_copy', language: aiLang, prompt: aiPrompt, adapter: 'local_deterministic' }),
                  });
                  const d = await res.json();
                  if (res.ok) {
                    setAiOutput(`${d.result.outputText} (${d.result.tokensEstimated} tokens via ${d.result.adapterUsed})`);
                    await loadOverview();
                  } else {
                    notify(d.error || 'AI call failed', true);
                  }
                }}
                className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-slate-950"
              >
                Run Local AI Router
              </button>
            </div>
            {aiOutput && <div className="rounded border border-slate-800 bg-slate-950 p-2.5 text-emerald-300">{aiOutput}</div>}
          </div>
        </div>
      )}

      {activeSection === 'rbac' && (
        <div className="grid gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
            <h3 className="font-semibold text-white flex items-center gap-1.5"><Database className="w-4 h-4 text-cyan-400" /> Workspaces ({overview.workspaces.length})</h3>
            <div className="flex gap-2">
              <input value={newWsSlug} onChange={e => setNewWsSlug(e.target.value)} placeholder="slug (e.g. dhaka-team)" className="w-1/3 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white" />
              <input value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder="Workspace Name" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white" />
              <button
                onClick={async () => {
                  const res = await fetch('/api/factory/workspaces', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'create_workspace', slug: newWsSlug, name: newWsName }),
                  });
                  const d = await res.json();
                  if (!res.ok) return notify(d.error || 'Failed', true);
                  setWorkspaceId(d.workspace.id);
                  notify(`Created workspace ${d.workspace.name}`);
                  await loadOverview();
                }}
                className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-slate-950"
              >
                Create
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2.5">
            <h3 className="font-semibold text-white flex items-center gap-1.5"><Users className="w-4 h-4 text-cyan-400" /> RBAC Workspace Members ({overview.members.length})</h3>
            <div className="flex gap-2">
              <input value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="Username" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-white" />
              <select value={memberRole} onChange={e => setMemberRole(e.target.value as 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer')} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white">
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="operator">operator</option>
                <option value="analyst">analyst</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                onClick={async () => {
                  const res = await fetch('/api/factory/workspaces', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId, action: 'upsert_member', username: memberName, role: memberRole }),
                  });
                  const d = await res.json();
                  if (!res.ok) return notify(d.error || 'Failed', true);
                  notify(`Assigned ${d.member.username} (${d.member.role})`);
                  await loadOverview();
                }}
                className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-slate-950"
              >
                Assign Role
              </button>
            </div>
            <div className="space-y-1">
              {overview.members.map(m => (
                <div key={m.id} className="flex justify-between bg-slate-950 rounded px-2.5 py-1 border border-slate-800">
                  <span className="text-slate-200">{m.username}</span>
                  <span className="font-mono text-cyan-300">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSection === 'audit' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
          <h3 className="font-semibold text-white flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-cyan-400" /> Factory Security &amp; Audit Events</h3>
          {overview.auditEvents.length === 0 ? <p className="text-slate-400">No factory audit events recorded yet.</p> : overview.auditEvents.map(ev => (
            <div key={ev.id} className="flex flex-wrap justify-between gap-2 rounded border border-slate-800 bg-slate-950 px-3 py-1.5">
              <span className="font-mono text-cyan-300">{ev.action}</span>
              <span className="text-slate-300 truncate max-w-[460px]">{ev.detail}</span>
              <span className="text-slate-500">{ev.actor} · {new Date(ev.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
