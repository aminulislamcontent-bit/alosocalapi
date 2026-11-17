'use client';

import { useState } from 'react';
import { ExternalLink, ShieldAlert, CheckCircle2, Sparkles, RefreshCw, Users, Layers } from 'lucide-react';
import type { CatalogProviderItem, OverviewPayload } from './types';

export function OverviewAndCatalogViews({
  view,
  overview,
  providers,
  selectedTenant,
  onNotify,
  onRefresh,
  onSelectProvider,
}: {
  view: string;
  overview: OverviewPayload;
  providers: CatalogProviderItem[];
  selectedTenant: string;
  onNotify: (msg: string, isErr?: boolean) => void;
  onRefresh: () => void;
  onSelectProvider: (key: string) => void;
}) {
  const [catFilter, setCatFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [oauthOnly, setOauthOnly] = useState(false);

  // Client & Requirements intake state
  const [newClientName, setNewClientName] = useState('');
  const [newClientBiz, setNewClientBiz] = useState('');
  const [businessName, setBusinessName] = useState('ALO Marketing Client');
  const [industry, setIndustry] = useState('Education & Digital Services');
  const [businessModel, setBusinessModel] = useState<'b2b' | 'b2c' | 'd2c_ecommerce' | 'education' | 'agency' | 'saas' | 'local_service'>('education');
  const [budget, setBudget] = useState<'bootstrap' | 'growth_500_2500' | 'scale_2500_10000' | 'enterprise_10000_plus'>('growth_500_2500');
  const [budgetConstraint, setBudgetConstraint] = useState<'free_and_open_source_first' | 'balanced_value' | 'best_in_class_paid'>('balanced_value');
  const [channels, setChannels] = useState<string[]>(['social', 'messaging', 'email', 'crm', 'seo', 'analytics']);
  const [ecommercePlatform, setEcommercePlatform] = useState<'none' | 'shopify' | 'woocommerce' | 'bigcommerce' | 'magento' | 'stripe_direct'>('none');
  const [domain, setDomain] = useState('');
  const [reqProviders, setReqProviders] = useState<string[]>(['meta_facebook_pages', 'whatsapp_cloud_api', 'google_analytics4', 'hubspot_crm_api']);
  const [submittingReq, setSubmittingReq] = useState(false);

  const filteredProviders = providers.filter(p => {
    if (catFilter && p.canonicalCategory !== catFilter) return false;
    if (oauthOnly && !p.oauthSupport) return false;
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      if (!`${p.key} ${p.displayName} ${p.canonicalCategory} ${p.authenticationType}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const runCatalogAudit = async () => {
    const res = await fetch('/api/onboarding/catalog', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return onNotify(data.error || 'Audit failed', true);
    onNotify(`Audited ${data.audit.validUrlProviders}/${data.audit.totalProviders} providers (${data.audit.issues.length} issue(s)).`);
  };

  const createTenantClient = async () => {
    if (!newClientName.trim() || !newClientBiz.trim()) {
      return onNotify('Enter client contact name and business name.', true);
    }
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newClientName.trim(),
        business: newClientBiz.trim(),
        platforms: ['facebook', 'whatsapp'],
      }),
    });
    const data = await res.json();
    if (!res.ok) return onNotify(data.error || 'Failed to create client', true);
    setNewClientName('');
    setNewClientBiz('');
    onNotify(`Created client workspace ${data.client.business} (${data.client.username}).`);
    onRefresh();
  };

  const submitRequirements = async () => {
    setSubmittingReq(true);
    try {
      const res = await fetch('/api/onboarding/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant,
          businessName,
          industry,
          businessModel,
          targetCountries: ['BD', 'US'],
          monthlyMarketingBudget: budget,
          technicalExperience: 'intermediate',
          requiredChannels: channels,
          emailVolume: '2500_to_50000',
          ecommercePlatform,
          existingWebsiteDomain: domain,
          existingAccounts: [],
          requiredIntegrations: reqProviders,
          budgetConstraint,
          teamSize: 'small_2_10',
          privacyComplianceNeeds: ['GDPR'],
          automationPreferences: 'hybrid',
        }),
      });
      const data = await res.json();
      if (!res.ok) return onNotify(data.error || 'Failed to save requirements', true);
      onNotify(`Saved requirements and generated ${data.recommendation.requiredPlatforms.length} required + ${data.recommendation.recommendedPlatforms.length} recommended matches.`);
      onRefresh();
    } finally {
      setSubmittingReq(false);
    }
  };

  if (view === 'v1_overview') {
    const latestInit = overview.initRuns[0];
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Canonical Providers', value: `${overview.catalogSummary.marketingPlatformCount}+`, sub: `${overview.catalogSummary.total} total across ${overview.canonicalCategories.length} categories` },
            { label: 'Active Workflows', value: overview.healthMetrics.workflowsTotal, sub: `${overview.healthMetrics.ownerActionPending} awaiting owner review/verification` },
            { label: 'Vault Credentials', value: overview.healthMetrics.vaultCredentialsCount, sub: `${overview.healthMetrics.expiringCount} expiring within 14d` },
            { label: 'Omni-Routing DLQ', value: overview.healthMetrics.deadLetterEvents, sub: `${overview.omniEvents.length} recent routed events` },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
              <div className="text-xs text-slate-400">{card.label}</div>
              <div className="mt-1 text-2xl font-bold text-white">{card.value}</div>
              <div className="mt-1 text-[11px] text-cyan-300">{card.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Runtime &amp; Boundary Status</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${overview.vaultReady ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
                {overview.vaultReady ? 'VAULT AES-256-GCM READY' : 'VAULT KEY MISSING'}
              </span>
            </div>
            <p className="text-xs text-slate-300">{overview.browserCapability.note}</p>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
              Independent CRM Boundary: ALOAPI never automatically connects to or writes into your external marketing CRM. Owners review and import verified bundles manually.
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Latest Post-Login Initialization</h3>
              <span className="text-[11px] font-mono text-cyan-300">{latestInit ? latestInit.status : 'NOT YET RUN'}</span>
            </div>
            {latestInit ? (
              <p className="text-xs text-slate-300">
                Triggered by <strong>{latestInit.triggeredBy}</strong> in {latestInit.durationMs}ms at {new Date(latestInit.createdAt).toLocaleString()}.
              </p>
            ) : (
              <p className="text-xs text-slate-400">Run initialization from View 16 or sign in cleanly.</p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
              {Object.entries(overview.catalogSummary.byCanonicalCategory).map(([cat, count]) => (
                <div key={cat} className="flex justify-between rounded bg-slate-950 px-2.5 py-1.5 border border-slate-800/80">
                  <span className="truncate text-slate-300">{cat}</span>
                  <span className="font-mono text-cyan-300 ml-2">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'v2_clients') {
    const channelOpts = ['social', 'messaging', 'ads', 'email', 'crm', 'seo', 'analytics', 'ecommerce', 'automation', 'forms'];
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <h3 className="text-base font-semibold text-white flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" /> Client Workspaces ({overview.clients.length})</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Owner / Contact Name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
            <input value={newClientBiz} onChange={e => setNewClientBiz(e.target.value)} placeholder="Business / Brand Name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
            <button onClick={createTenantClient} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950">Create Tenant Workspace</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-2">
            {overview.clients.map(c => (
              <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs flex justify-between items-center">
                <div>
                  <div className="font-semibold text-white">{c.business}</div>
                  <div className="text-[11px] text-slate-400">{c.name} · @{c.username}</div>
                </div>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-300">{c.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <h3 className="text-base font-semibold text-white">Client Requirements Intake Wizard (Active Tenant: {selectedTenant})</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Business Name</label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Industry</label>
              <input value={industry} onChange={e => setIndustry(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Business Model</label>
              <select value={businessModel} onChange={e => setBusinessModel(e.target.value as typeof businessModel)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                <option value="education">Education / Learning</option>
                <option value="b2c">B2C Services</option>
                <option value="b2b">B2B</option>
                <option value="d2c_ecommerce">D2C Ecommerce</option>
                <option value="agency">Marketing Agency</option>
                <option value="saas">SaaS</option>
                <option value="local_service">Local Service</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Monthly Marketing Budget</label>
              <select value={budget} onChange={e => setBudget(e.target.value as typeof budget)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                <option value="bootstrap">Bootstrap (&lt;$500/mo)</option>
                <option value="growth_500_2500">Growth ($500–$2,500/mo)</option>
                <option value="scale_2500_10000">Scale ($2,500–$10,000/mo)</option>
                <option value="enterprise_10000_plus">Enterprise ($10k+/mo)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Budget Strategy</label>
              <select value={budgetConstraint} onChange={e => setBudgetConstraint(e.target.value as typeof budgetConstraint)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                <option value="free_and_open_source_first">Free &amp; Open-Source First</option>
                <option value="balanced_value">Balanced Value</option>
                <option value="best_in_class_paid">Best-in-Class Paid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ecommerce Platform</label>
              <select value={ecommercePlatform} onChange={e => setEcommercePlatform(e.target.value as typeof ecommercePlatform)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                <option value="none">None / Services</option>
                <option value="shopify">Shopify</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="bigcommerce">BigCommerce</option>
                <option value="magento">Magento</option>
                <option value="stripe_direct">Stripe Direct</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Existing Website Domain</label>
              <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="https://yourdomain.com" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">Required Marketing Channels</label>
            <div className="flex flex-wrap gap-2">
              {channelOpts.map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannels(prev => prev.includes(ch) ? prev.filter(x => x !== ch) : [...prev, ch])}
                  className={`px-2.5 py-1 rounded text-xs font-mono border ${channels.includes(ch) ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-700 text-slate-400'}`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Priority Provider Keys (comma-separated)</label>
            <input
              value={reqProviders.join(', ')}
              onChange={e => setReqProviders(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
            />
          </div>
          <button disabled={submittingReq} onClick={submitRequirements} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950">
            <Sparkles className="w-4 h-4" /> {submittingReq ? 'Evaluating...' : 'Evaluate & Save Recommendations'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'v3_catalog') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search 100+ providers, scopes, auth..."
            className="flex-1 min-w-[220px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
            <option value="">All 10 Categories ({providers.length})</option>
            {overview.canonicalCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={oauthOnly} onChange={e => setOauthOnly(e.target.checked)} />
            OAuth Only
          </label>
          <button onClick={runCatalogAudit} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh &amp; Audit Official Docs
          </button>
        </div>

        <div className="text-xs text-slate-400">Showing {filteredProviders.length} of {providers.length} registered providers.</div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 max-h-[560px] overflow-y-auto pr-1">
          {filteredProviders.map(p => (
            <div key={p.key} className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-sm text-white">{p.displayName}</h4>
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">L{p.implementationLevel}</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{p.canonicalCategory} · {p.authenticationType} · {p.apiVersion}</p>
                <p className="mt-2 text-xs text-slate-300 line-clamp-2">{p.supportedOperations.join(' · ') || 'Catalog reference entry'}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                <button onClick={() => onSelectProvider(p.key)} className="text-cyan-400 hover:underline font-medium">Inspect &amp; Onboard</button>
                <a href={p.officialApiDocumentation} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-400 hover:text-white">
                  Docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // v4_comparison: Side-by-Side Matrix + Client Recommendations + 6 Platform Playbooks
  const latestProfile = overview.profiles.find(p => p.clientId === selectedTenant) || overview.profiles[0];
  const parsedRec = (() => {
    try { return latestProfile ? JSON.parse(latestProfile.recommendations) : null; } catch { return null; }
  })();
  const sample = filteredProviders.slice(0, 30);
  const cols = ['accountDiscovery', 'oauth', 'apiKeyConfiguration', 'contentPublishing', 'leadCapture', 'messaging', 'analytics', 'webhooks', 'reporting'];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Layers className="w-4 h-4 text-cyan-400" /> Platform Capability Comparison Matrix</h3>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white">
            <option value="">All Categories</option>
            {overview.canonicalCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="p-2.5">Provider</th>
                <th className="p-2.5">Level</th>
                {cols.map(c => <th key={c} className="p-2.5 font-mono">{c}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-950">
              {sample.map(p => (
                <tr key={p.key} className="hover:bg-slate-900/60">
                  <td className="p-2.5 font-medium text-white whitespace-nowrap">{p.displayName}</td>
                  <td className="p-2.5 font-mono text-cyan-300">L{p.implementationLevel}</td>
                  {cols.map(col => {
                    const st = p.capabilityMatrix[col] || 'NOT_VERIFIED';
                    const cls = st === 'SUPPORTED' ? 'text-emerald-300' : st === 'APPROVAL_REQUIRED' || st === 'OWNER_ACTION_REQUIRED' ? 'text-amber-300' : st === 'PARTIALLY_SUPPORTED' ? 'text-cyan-300' : 'text-slate-500';
                    return <td key={col} className={`p-2.5 font-mono text-[10px] ${cls}`}>{st}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!parsedRec ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-300">
          No client recommendation plan saved yet for tenant <strong>{selectedTenant}</strong>. Run the Client Requirements Intake in View 2 (Client Management) to rank required, recommended, and alternative platforms.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="text-sm font-semibold text-white">Recommended Plan &amp; Cost/Approval Comparison for {latestProfile.businessName}</h3>
            <p className="text-xs text-slate-400 mt-1">
              Required: {parsedRec.requiredPlatforms?.length ?? 0} · Recommended: {parsedRec.recommendedPlatforms?.length ?? 0} · Alternatives: {parsedRec.optionalPlatforms?.length ?? 0}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[...(parsedRec.requiredPlatforms ?? []), ...(parsedRec.recommendedPlatforms ?? []).slice(0, 6)].map((rec: {
              providerKey: string;
              displayName: string;
              tier: string;
              score: number;
              whyFits: string[];
              approvalFriction: string;
              expectedCost: string;
            }) => (
              <div key={rec.providerKey} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-white">{rec.displayName}</span>
                  <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${rec.tier === 'REQUIRED' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                    {rec.tier} · {rec.score}/100
                  </span>
                </div>
                <p className="text-xs text-slate-300">{rec.whyFits.join(' ')}</p>
                <p className="text-[11px] text-amber-300">Approval: {rec.approvalFriction} · {rec.expectedCost}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white">Platform-Specific Playbooks (Meta, Google, TikTok, LinkedIn, Email, CRM)</h4>
            {(parsedRec.playbooks ?? []).map((pb: { track: string; title: string; steps: string[]; securityAndComplianceNotes: string[] }) => (
              <details key={pb.track} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
                <summary className="cursor-pointer font-semibold text-cyan-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {pb.title}
                </summary>
                <ol className="mt-3 list-decimal list-inside space-y-1 text-slate-300">
                  {pb.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
                <div className="mt-2 flex items-start gap-1.5 text-amber-300">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{pb.securityAndComplianceNotes.join(' ')}</span>
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
