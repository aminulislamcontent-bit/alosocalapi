'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, KeyRound } from 'lucide-react';
import type { CatalogProviderItem, OverviewPayload } from './types';
import { OverviewAndCatalogViews } from './panels-core';
import { OnboardingExecutionViews } from './panels-ops';

/**
 * Master Production Spec Section 15: Exact 19 Dashboard Views
 */
const VIEWS = [
  { id: 'v1_overview', label: '1. Executive Overview' },
  { id: 'v2_clients', label: '2. Client Management' },
  { id: 'v3_catalog', label: '3. Platform Catalog' },
  { id: 'v4_comparison', label: '4. Platform Comparison' },
  { id: 'v5_account_setup', label: '5. Account Setup Center' },
  { id: 'v6_dev_portal', label: '6. Developer Portal Setup' },
  { id: 'v7_oauth', label: '7. OAuth Authorization' },
  { id: 'v8_vault', label: '8. Credential Vault' },
  { id: 'v9_api_docs', label: '9. API Docs Intelligence' },
  { id: 'v10_builder', label: '10. Integration Builder' },
  { id: 'v11_webhooks', label: '11. Webhook Manager' },
  { id: 'v12_omni', label: '12. Omni-Event Monitor' },
  { id: 'v13_agents', label: '13. AI Agent Activity' },
  { id: 'v14_approvals', label: '14. Approval Center' },
  { id: 'v15_health', label: '15. System Health' },
  { id: 'v16_healing', label: '16. Self-Healing Center' },
  { id: 'v17_verify', label: '17. Verification Center' },
  { id: 'v18_export', label: '18. Export Center' },
  { id: 'v19_audit', label: '19. Audit Logs' },
] as const;

export default function OnboardingHub({ onToast }: { onToast?: (msg: string, type?: string) => void }) {
  const [view, setView] = useState<string>('v1_overview');
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [providers, setProviders] = useState<CatalogProviderItem[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('default-workspace');
  const [selectedProviderKey, setSelectedProviderKey] = useState<string>('meta_facebook_pages');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const notify = (msg: string, isErr = false) => {
    if (onToast) onToast(msg, isErr ? 'error' : 'success');
  };

  const loadAll = useCallback(async () => {
    try {
      const [ovRes, catRes] = await Promise.all([
        fetch('/api/onboarding/overview', { cache: 'no-store' }),
        fetch('/api/onboarding/catalog', { cache: 'no-store' }),
      ]);
      const ov = await ovRes.json();
      const cat = await catRes.json();
      if (!ovRes.ok) throw new Error(ov.error || 'Failed to load onboarding overview');
      if (!catRes.ok) throw new Error(cat.error || 'Failed to load catalog');
      setOverview(ov);
      setProviders(cat.providers || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load onboarding hub');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/onboarding/overview', { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json() })),
      fetch('/api/onboarding/catalog', { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json() })),
    ])
      .then(([ov, cat]) => {
        if (!active) return;
        if (!ov.ok) throw new Error(ov.data?.error || 'Failed to load onboarding overview');
        if (!cat.ok) throw new Error(cat.data?.error || 'Failed to load catalog');
        setOverview(ov.data);
        setProviders(cat.data.providers || []);
        setError(null);
        setLoading(false);
      })
      .catch(e => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Failed to load onboarding hub');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading && !overview) {
    return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Loading Autonomous Onboarding &amp; Intelligence Hub...</div>;
  }

  if (error || !overview) {
    return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-200">{error || 'Unable to load onboarding data.'}</div>;
  }

  const isCoreView = ['v1_overview', 'v2_clients', 'v3_catalog', 'v4_comparison'].includes(view);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Autonomous Marketing Onboarding &amp; API Intelligence</h2>
          <p className="text-xs text-slate-400">
            {overview.catalogSummary.marketingPlatformCount}+ Marketing Platforms · 10 Categories · Agents A–H · 20-State Lifecycle · AES-256-GCM Vault
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={selectedTenant}
            onChange={e => setSelectedTenant(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
            aria-label="Select tenant workspace"
          >
            <option value="default-workspace">default-workspace</option>
            {overview.clients.map(c => (
              <option key={c.id} value={c.id}>{c.business} ({c.username})</option>
            ))}
          </select>
          <select
            value={selectedProviderKey}
            onChange={e => setSelectedProviderKey(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white max-w-[240px]"
            aria-label="Select active provider"
          >
            {providers.map(p => (
              <option key={p.key} value={p.key}>{p.displayName}</option>
            ))}
          </select>
          <button
            onClick={() => setView('v8_vault')}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            <KeyRound className="w-3.5 h-3.5" /> Add API Credentials
          </button>
          <button
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-200 hover:border-cyan-400"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* 19-View Section 15 Sub-Navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              view === v.id
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'bg-slate-950/70 text-slate-300 border border-slate-800 hover:border-slate-600'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {isCoreView ? (
        <OverviewAndCatalogViews
          view={view}
          overview={overview}
          providers={providers}
          selectedTenant={selectedTenant}
          onNotify={notify}
          onRefresh={() => void loadAll()}
          onSelectProvider={key => {
            setSelectedProviderKey(key);
            setView('v6_dev_portal');
          }}
        />
      ) : (
        <OnboardingExecutionViews
          view={view}
          overview={overview}
          providers={providers}
          selectedTenant={selectedTenant}
          selectedProviderKey={selectedProviderKey}
          onNotify={notify}
          onRefresh={() => void loadAll()}
          onNavigateView={setView}
        />
      )}
    </div>
  );
}
