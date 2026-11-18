'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe,
  KeyRound,
  ShieldCheck,
  PackageCheck,
  RefreshCw,
  CheckCircle2,
  Download,
  ExternalLink,
  AlertCircle,
  Cpu,
} from 'lucide-react';

interface ProjectRecord {
  id: string;
  clientId: string;
  name: string;
  websiteUrl: string;
  domain: string;
  status: string;
  defaultHandoverMode: string;
  businessProfileJson: string;
  missingFieldsJson: string;
  recommendedProvidersJson: string;
  selectedProvidersJson: string;
  discoveries: { id: string; fetchStatus: string; socialProfilesJson: string; detectedTechJson: string }[];
  credentials: {
    id: string;
    providerKey: string;
    credentialType: string;
    origin: string;
    owner: string;
    envVarName: string;
    transferable: boolean;
    handoverMode: string;
    activationStatus: string;
    handoverRequirements: string;
    vaultCredentialId: string | null;
  }[];
  oauthApps: {
    id: string;
    providerKey: string;
    appName: string;
    executionMode: string;
    verificationStatus: string;
    apiVersion: string;
    webhookUrl: string | null;
    webhookSignatureAlgorithm: string;
    redirectUrisJson: string;
    dnsRecordsJson: string;
    scopesJson: string;
    developerPortalUrl: string;
  }[];
  checkpoints: {
    id: string;
    providerKey: string;
    checkpointType: string;
    status: string;
    officialPortalUrl: string;
    instructions: string;
    resumedWorkflowState: string | null;
  }[];
  handovers: {
    id: string;
    packageStatus: string;
    handoverMode: string;
    secretsIncluded: boolean;
    sha256: string;
    exportedAt: string;
    checklistJson: string;
    clientImportManifestJson: string;
  }[];
}

interface AdapterItem {
  providerKey: string;
  displayName: string;
  canonicalCategory: string;
  executionMode: string;
  handoverMode: string;
  credentialsTransferable: boolean;
  developerAccountRequired: boolean;
  hasOfficialAppCreationApi: boolean;
  requiredPermissionsAndScopes: string[];
  issuableCredentials: string[];
  handoverRationale: string;
}

export default function EngineeringHub({ onToast }: { onToast?: (msg: string, type?: string) => void }) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [adapters, setAdapters] = useState<AdapterItem[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([
    'meta_facebook_pages',
    'google_analytics4',
    'sendgrid_api',
    'whatsapp_cloud_api',
  ]);
  const [websiteUrl, setWebsiteUrl] = useState('https://example.com');
  const [identityKind, setIdentityKind] = useState<'url' | 'phone' | 'account'>('url');
  const [identityValue, setIdentityValue] = useState('');
  const [identityProviderKey, setIdentityProviderKey] = useState('meta_facebook_pages');
  const [identityHandover, setIdentityHandover] = useState<Record<string, unknown> | null>(null);
  const [identityPortal, setIdentityPortal] = useState(false);

  const [projectName, setProjectName] = useState('');
  const [htmlSnapshot, setHtmlSnapshot] = useState('');
  const [subTab, setSubTab] = useState<'discover' | 'adapters' | 'credentials' | 'checkpoints' | 'handover'>('discover');
  const [adapterFilter, setAdapterFilter] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const [apiActionResult, setApiActionResult] = useState<string | null>(null);
  const [ownerApprovalGate, setOwnerApprovalGate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentialProviderKey, setCredentialProviderKey] = useState('meta_facebook_pages');
  const [credentialType, setCredentialType] = useState('oauth_client_id');
  const [credentialLabel, setCredentialLabel] = useState('primary');
  const [credentialValue, setCredentialValue] = useState('');
  const [credentialScopes, setCredentialScopes] = useState('');
  const [credentialExpiryDays, setCredentialExpiryDays] = useState('');
  const [savingCredential, setSavingCredential] = useState(false);
  const [vaultCredentialRows, setVaultCredentialRows] = useState<Array<{ id: string; providerKey: string; credentialType: string; label: string; effectiveStatus: string; keyVersion: number; expiresAt: string | null }>>([]);

  const notify = useCallback(
    (msg: string, isErr = false) => {
      if (onToast) onToast(msg, isErr ? 'error' : 'success');
    },
    [onToast],
  );

  const reload = useCallback(async () => {
    try {
      const [projRes, adapRes] = await Promise.all([
        fetch('/api/engineering/projects', { cache: 'no-store' }),
        fetch('/api/engineering/providers', { cache: 'no-store' }),
      ]);
      const pJson = await projRes.json();
      const aJson = await adapRes.json();
      if (!projRes.ok) throw new Error(pJson.error || 'Authentication or load error');
      setProjects(pJson.projects || []);
      if (pJson.projects?.[0]?.id) {
        setActiveProjectId(prev => prev || pJson.projects[0].id);
      }
      if (adapRes.ok) setAdapters(aJson.adapters || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Integration Engineering Hub');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/engineering/projects', { cache: 'no-store' }).then(async r => ({ ok: r.ok, d: await r.json() })),
      fetch('/api/engineering/providers', { cache: 'no-store' }).then(async r => ({ ok: r.ok, d: await r.json() })),
    ])
      .then(([p, a]) => {
        if (cancelled) return;
        if (!p.ok) throw new Error(p.d?.error || 'Authentication required');
        setProjects(p.d.projects || []);
        if (p.d.projects?.[0]?.id) setActiveProjectId(prev => prev || p.d.projects[0].id);
        if (a.ok) setAdapters(a.d.adapters || []);
        setError(null);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load hub');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || null;
  const activeProjectClientId = activeProject?.clientId;

  const loadVaultCredentials = useCallback(async () => {
    if (!activeProjectClientId) return;
    try {
      const query = new URLSearchParams({ tenantId: activeProjectClientId });
      if (credentialProviderKey) query.set('providerKey', credentialProviderKey);
      const res = await fetch(`/api/onboarding/vault?${query.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load saved credentials');
      setVaultCredentialRows(data.credentials || []);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }, [activeProjectClientId, credentialProviderKey, notify]);

  useEffect(() => { void loadVaultCredentials(); }, [loadVaultCredentials]);

  const saveProviderCredential = async () => {
    if (!activeProject?.clientId || !credentialProviderKey || !credentialValue.trim()) {
      notify('Select a provider and enter the credential value.', true);
      return;
    }
    setSavingCredential(true);
    try {
      const days = Number(credentialExpiryDays);
      const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : undefined;
      const res = await fetch('/api/onboarding/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'store',
          tenantId: activeProject?.clientId || 'default-workspace',
          providerKey: credentialProviderKey,
          credentialType,
          label: credentialLabel.trim() || 'primary',
          value: credentialValue,
          scopes: credentialScopes.split(',').map(s => s.trim()).filter(Boolean),
          expiresAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credential storage failed');
      setCredentialValue('');
      notify(`Encrypted ${credentialType} for ${credentialProviderKey} in the project vault.`);
      await loadVaultCredentials();
      await reload();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSavingCredential(false);
    }
  };

  const prepareSelectedProvider = async () => {
    if (!activeProject) return;
    setBusy(true);
    try {
      const res = await fetch('/api/engineering/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare_providers', projectId: activeProject.id, providerKeys: [credentialProviderKey] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Provider preparation failed');
      notify(`Prepared ${credentialProviderKey}: redirect URI, webhook and credential requirements are ready.`);
      await reload();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const startProviderOAuth = async () => {
    if (!activeProject?.clientId) return;
    try {
      const res = await fetch('/api/onboarding/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_flow',
          tenantId: activeProject.clientId,
          providerKey: credentialProviderKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to start OAuth');
      if (!data.clientIdConfigured || !data.clientSecretConfigured) {
        notify(data.warning || 'Save both the official OAuth Client ID and Client Secret first.', true);
        return;
      }
      if (!data.authorizationUrl) throw new Error('Provider did not return an authorization URL.');
      window.location.assign(data.authorizationUrl);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  if (error && projects.length === 0) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-200 space-y-2">
        <div>{error}</div>
        <Link href="/" className="inline-block text-xs text-cyan-300 underline">Sign in via ALOAPI Admin Console &rarr;</Link>
      </div>
    );
  }

  const generateIdentityHandover = async () => {
    if (!identityValue.trim()) { notify('Enter a Facebook Page URL, WhatsApp phone number, or account identifier.', true); return; }
    setBusy(true);
    setIdentityHandover(null);
    try {
      const res = await fetch('/api/onboarding/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: activeProject?.clientId || 'default-workspace',
          providerKey: identityProviderKey,
          identityKind,
          identityValue: identityValue.trim(),
          startOfficialPortal: identityPortal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to generate integration handover.');
      setIdentityHandover(data as Record<string, unknown>);
      notify('Handover manifest generated. Provider-side app creation is not claimed.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const runDiscovery = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/engineering/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discover_website',
          websiteUrl,
          projectName: projectName || undefined,
          htmlSnapshot: htmlSnapshot.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Discovery failed');
      setActiveProjectId(data.project.id);
      if (Array.isArray(data.discovery?.recommendedProviderKeys)) {
        setSelectedProviders(data.discovery.recommendedProviderKeys);
      }
      notify(`Discovered ${data.discovery.domain} (${data.discovery.fetchStatus}).`);
      await reload();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const prepareProviders = async () => {
    if (!activeProject) return;
    setBusy(true);
    try {
      const res = await fetch('/api/engineering/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare_providers',
          projectId: activeProject.id,
          providerKeys: selectedProviders,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Provider preparation failed');
      notify(`Prepared ${data.prepared.length} provider app(s), cryptographic credentials & verification checkpoints.`);
      setSubTab('credentials');
      await reload();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const filteredAdapters = adapters.filter(
    a =>
      !adapterFilter.trim() ||
      a.displayName.toLowerCase().includes(adapterFilter.toLowerCase()) ||
      a.providerKey.toLowerCase().includes(adapterFilter.toLowerCase()) ||
      a.canonicalCategory.toLowerCase().includes(adapterFilter.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            ALOAPI Integration Engineering &amp; Client Handover Workspace
          </h2>
          <p className="text-xs text-slate-400">
            Independent Pre-Provisioning · URL Discovery · 4-Origin Credentials · {adapters.length} Provider Adapters · 17-Section Handover · Legacy CRM Untouched
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {projects.length > 0 && (
            <select
              value={activeProject?.id || ''}
              onChange={e => setActiveProjectId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
              ))}
            </select>
          )}
          <button onClick={() => void reload()} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-200">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-cyan-500/30 bg-slate-900 p-4 space-y-3 text-xs">
        <div>
          <h3 className="text-sm font-semibold text-white">Account Identity → Integration Handover</h3>
          <p className="text-slate-400">Start from a Facebook Page URL, WhatsApp number, or provider account ID. Generates a tenant-scoped manifest and optional official-portal owner checkpoint. Provider credentials are never fabricated.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <select value={identityProviderKey} onChange={e => setIdentityProviderKey(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
            {adapters.map(a => <option key={a.providerKey} value={a.providerKey}>{a.displayName}</option>)}
          </select>
          <select value={identityKind} onChange={e => setIdentityKind(e.target.value as typeof identityKind)} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
            <option value="url">Page / Account URL</option>
            <option value="phone">WhatsApp Phone (E.164)</option>
            <option value="account">Account Identifier</option>
          </select>
          <input value={identityValue} onChange={e => setIdentityValue(e.target.value)} placeholder={identityKind === 'phone' ? '+8801XXXXXXXXX' : identityKind === 'url' ? 'https://facebook.com/your-page' : 'Provider account ID'} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white md:col-span-2" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={identityPortal} onChange={e => setIdentityPortal(e.target.checked)} /> Create supervised official-portal checkpoint</label>
          <button disabled={busy} onClick={() => void generateIdentityHandover()} className="rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Preparing…' : 'Generate Real Handover Manifest'}</button>
          {!activeProject && <span className="text-slate-400">Using the default admin workspace until a client project is selected.</span>}
        </div>
        {identityHandover && (
          <div className="space-y-2">
            {(() => {
              const session = identityHandover.browserSession as { officialUrl?: string; status?: string; executionMode?: string } | null;
              return session?.officialUrl ? <a href={session.officialUrl} target="_blank" rel="noreferrer" className="inline-flex rounded border border-cyan-500/40 px-3 py-2 text-cyan-200 underline">Open official provider portal ({session.executionMode || session.status || 'owner checkpoint'})</a> : null;
            })()}
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-700 bg-slate-950 p-3 text-[11px] text-cyan-100">{JSON.stringify(identityHandover, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2 text-xs">
        {[
          { id: 'discover', label: '1. Website URL Discovery' },
          { id: 'adapters', label: `2. Universal Adapters (${adapters.length})` },
          { id: 'credentials', label: '3. Credentials, OAuth, Webhooks & DNS' },
          { id: 'checkpoints', label: '4. Verification & Resume' },
          { id: 'handover', label: '5. Client Handover & Import' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-3 py-1.5 rounded-lg font-medium ${subTab === t.id ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-950 text-slate-300 border border-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'discover' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Globe className="w-4 h-4 text-cyan-400" /> Website-URL Autonomous Discovery</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://example.com" className="sm:col-span-2 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-white" />
              <input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Optional project name" className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-white" />
            </div>
            <textarea
              value={htmlSnapshot}
              onChange={e => setHtmlSnapshot(e.target.value)}
              rows={3}
              placeholder="Optional: paste HTML source if running offline or behind strict firewall (otherwise ALOAPI fetches live HTTPS URL cleanly)."
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono text-[11px]"
            />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => void runDiscovery()} className="rounded bg-cyan-500 px-3.5 py-1.5 font-semibold text-slate-950">
                {busy ? 'Inspecting...' : 'Run Website Discovery'}
              </button>
              {activeProject && (
                <button disabled={busy} onClick={() => void prepareProviders()} className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 font-semibold text-emerald-200">
                  Prepare {selectedProviders.length} Recommended Providers
                </button>
              )}
            </div>
          </div>

          {activeProject && (
            <div className="grid gap-4 lg:grid-cols-2 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                <h4 className="font-semibold text-white">Extracted Business Profile ({activeProject.domain})</h4>
                <pre className="rounded border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-300 whitespace-pre-wrap break-all">
                  {JSON.stringify(JSON.parse(activeProject.businessProfileJson), null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                <h4 className="font-semibold text-white flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-amber-400" /> Honest Missing Fields &amp; Detected Channels</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(JSON.parse(activeProject.missingFieldsJson) as string[]).map(mf => (
                    <span key={mf} className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200 font-mono">Missing: {mf}</span>
                  ))}
                </div>
                {activeProject.discoveries[0] && (
                  <pre className="rounded border border-slate-800 bg-slate-950 p-3 text-[11px] text-cyan-200 whitespace-pre-wrap break-all">
                    Social &amp; Marketing Tech:{'\n'}
                    {JSON.stringify({
                      social: JSON.parse(activeProject.discoveries[0].socialProfilesJson),
                      tech: JSON.parse(activeProject.discoveries[0].detectedTechJson),
                    }, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'adapters' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <input value={adapterFilter} onChange={e => setAdapterFilter(e.target.value)} placeholder="Filter 131 adapters by name, category, or key..." className="w-80 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-white" />
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/engineering/providers?format=matrix${activeProject ? `&projectId=${encodeURIComponent(activeProject.id)}` : ''}`}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200"
              >
                131&times;17 Completion Matrix JSON
              </a>
              {activeProject && (
                <button disabled={busy} onClick={() => void prepareProviders()} className="rounded bg-cyan-500 px-3.5 py-1.5 font-semibold text-slate-950">
                  Prepare Selected ({selectedProviders.length}) for {activeProject.name}
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 max-h-[520px] overflow-y-auto">
            {filteredAdapters.map(a => {
              const checked = selectedProviders.includes(a.providerKey);
              return (
                <div key={a.providerKey} className={`rounded-lg border p-3 space-y-1.5 ${checked ? 'border-cyan-500 bg-slate-950' : 'border-slate-800 bg-slate-950/60'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <label className="flex items-center gap-2 font-semibold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedProviders(prev => checked ? prev.filter(x => x !== a.providerKey) : [...prev, a.providerKey])}
                      />
                      {a.displayName}
                    </label>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">{a.executionMode}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{a.canonicalCategory} · Handover: <strong className="text-slate-200">{a.handoverMode}</strong></div>
                  <div className="text-[10px] text-slate-500">Transferable: {a.credentialsTransferable ? 'Yes' : 'Client Reissue/Delegation'} · Auto-App API: {a.hasOfficialAppCreationApi ? 'Yes' : 'Owner Portal'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'credentials' && (
        <div className="space-y-4 text-xs">
          {!activeProject ? <p className="text-slate-400">Create or select an Engineering Project first.</p> : (
            <>
              <div className="rounded-xl border border-cyan-500/30 bg-slate-900 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Connect a Provider — Add API Keys, App ID, App Secret &amp; Tokens</h3>
                  <p className="mt-1 text-[11px] text-slate-300">This is the actual credential entry point for the selected project. Values are sent directly to the server and encrypted in the AES-256-GCM Vault; they are never displayed again or written to browser storage.</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-300">Platform / Provider</span>
                    <select value={credentialProviderKey} onChange={e => setCredentialProviderKey(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                      {adapters.map(a => <option key={a.providerKey} value={a.providerKey}>{a.displayName} ({a.providerKey})</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-300">Credential field</span>
                    <select value={credentialType} onChange={e => setCredentialType(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white">
                      <option value="oauth_client_id">OAuth Client ID / Meta App ID</option>
                      <option value="oauth_client_secret">OAuth Client Secret / Meta App Secret</option>
                      <option value="oauth_access_token">OAuth / Page Access Token</option>
                      <option value="access_token">Access Token</option>
                      <option value="api_key">API Key</option>
                      <option value="app_secret">App Secret (provider-specific)</option>
                      <option value="refresh_token">Refresh Token</option>
                      <option value="business_identifier">Business ID</option>
                      <option value="account_identifier">Account / Page ID</option>
                      <option value="bot_token">Bot Token</option>
                      <option value="webhook_secret">Webhook Verify / Signing Secret</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-300">Label</span>
                    <input value={credentialLabel} onChange={e => setCredentialLabel(e.target.value)} placeholder="primary" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-300">Expires in days (optional)</span>
                    <input value={credentialExpiryDays} onChange={e => setCredentialExpiryDays(e.target.value)} inputMode="numeric" placeholder="Leave blank if unknown" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-300">Credential value</span>
                  <input type="password" autoComplete="new-password" value={credentialValue} onChange={e => setCredentialValue(e.target.value)} placeholder="Paste the value issued by the provider — never paste your account password or OTP" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-300">Granted scopes / permissions (comma-separated, optional)</span>
                  <input value={credentialScopes} onChange={e => setCredentialScopes(e.target.value)} placeholder="pages_show_list, pages_read_engagement, pages_manage_posts" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button disabled={savingCredential || !credentialValue.trim()} onClick={() => void saveProviderCredential()} className="rounded bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{savingCredential ? 'Encrypting…' : 'Save Credential Securely'}</button>
                  <button disabled={busy} onClick={() => void prepareSelectedProvider()} className="rounded border border-cyan-500/40 px-3.5 py-2 text-xs font-semibold text-cyan-200">Prepare This Provider</button>
                  <button onClick={() => void startProviderOAuth()} className="rounded border border-emerald-500/40 px-3.5 py-2 text-xs font-semibold text-emerald-200">Continue with Official OAuth</button>
                  {adapters.find(a => a.providerKey === credentialProviderKey) && <a className="rounded border border-slate-700 px-3.5 py-2 text-xs text-cyan-200" href={`/api/engineering/providers?providerKey=${encodeURIComponent(credentialProviderKey)}`} target="_blank" rel="noreferrer">View Provider Setup Profile</a>}
                </div>
                {credentialProviderKey === 'meta_facebook_pages' && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-[11px] text-slate-200 space-y-1">
                    <strong className="text-blue-200">Meta / Facebook Pages setup</strong>
                    <p>1. Create or select your app at developers.facebook.com. 2. Save its App ID as OAuth Client ID. 3. Save its App Secret as OAuth Client Secret. 4. Add the displayed redirect URI in the Meta app's Facebook Login settings. 5. Use Continue with Official OAuth and approve only the required permissions. 6. The returned access token is stored by the callback. For server-side Page publishing, make sure the granted token is a Page token and that the app has the required Page permissions and review/access level.</p>
                    <p className="text-slate-400">Never enter your Facebook password, OTP, or recovery code here. Meta issues the App ID, App Secret and tokens; ALOAPI cannot generate them.</p>
                    <a className="text-cyan-300 underline" href="https://developers.facebook.com/docs/graph-api/get-started/" target="_blank" rel="noreferrer">Meta official Graph API guide</a>
                  </div>
                )}
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-200">Saved encrypted credentials for this provider ({vaultCredentialRows.length})</div>
                  {vaultCredentialRows.length === 0 ? <p className="text-[11px] text-slate-500">No credentials stored for this provider in the selected project yet.</p> : vaultCredentialRows.map(row => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono text-slate-300">{row.credentialType} · {row.label} · v{row.keyVersion}</span>
                      <span className="text-emerald-300">{row.effectiveStatus}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-cyan-400" /> Prepared OAuth Apps, Webhooks, DNS &amp; Live Read-Only Connection Probes ({activeProject.oauthApps.length})</h3>
                <div className="space-y-2">
                  {activeProject.oauthApps.map(app => (
                    <div key={app.id} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-1.5">
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div>
                          <strong className="text-white">{app.appName}</strong>
                          <span className="ml-2 font-mono text-[10px] text-cyan-300">{app.executionMode} · {app.verificationStatus}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={async () => {
                              const res = await fetch('/api/engineering/providers', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'test_connection', projectId: activeProject.id, providerKey: app.providerKey }),
                              });
                              const d = await res.json();
                              notify(d.probe?.message || d.error || 'Probe completed', !d.probe?.verified);
                              await reload();
                            }}
                            className="rounded border border-cyan-500/40 px-2.5 py-1 text-[11px] text-cyan-200"
                          >
                            Run Honest Live Connection Probe
                          </button>
                          <button
                            onClick={async () => {
                              const res = await fetch('/api/engineering/checkpoints', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'verify_dns', projectId: activeProject.id, providerKey: app.providerKey }),
                              });
                              const d = await res.json();
                              notify(`DNS Check (${d.domain}): ${d.status}`, !d.verified);
                              await reload();
                            }}
                            className="rounded border border-emerald-500/40 px-2.5 py-1 text-[11px] text-emerald-200"
                          >
                            Verify Live DNS
                          </button>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400">Webhook: {app.webhookUrl} ({app.webhookSignatureAlgorithm}) · API {app.apiVersion}</div>
                      <div className="text-[11px] text-slate-300">OAuth Redirect URI(s): <code className="break-all text-cyan-200">{(() => { try { return (JSON.parse(app.redirectUrisJson) as string[]).join(' · ') || 'Not applicable'; } catch { return 'Not configured'; } })()}</code></div>
                      <div className="text-[11px] text-slate-300">Required scopes: <code className="break-all text-cyan-200">{app.scopesJson}</code></div>
                      <a className="text-[11px] text-cyan-300 underline" href={app.developerPortalUrl} target="_blank" rel="noreferrer">Open official {app.providerKey} developer portal</a>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">Authorized Autonomous Client API Execution Gate</h3>
                  <label className="flex items-center gap-1.5 text-[11px] text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ownerApprovalGate}
                      onChange={e => setOwnerApprovalGate(e.target.checked)}
                    />
                    Explicit Owner Approval Granted (High-Impact Actions)
                  </label>
                </div>
                <p className="text-[11px] text-slate-400">
                  Reads client credentials from AES-256-GCM Vault only; high-impact mutations (publish, send, billing, delete) are blocked until explicit owner approval is checked.
                </p>
                {activeProject.oauthApps[0] && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/engineering/providers', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'execute_client_api',
                            projectId: activeProject.id,
                            providerKey: activeProject.oauthApps[0].providerKey,
                            actionName: 'publish_campaign_broadcast',
                            httpMethod: 'POST',
                            ownerApprovalGranted: ownerApprovalGate,
                            approvalReference: ownerApprovalGate ? 'owner_ui_approved' : undefined,
                          }),
                        });
                        const d = await res.json();
                        setApiActionResult(JSON.stringify(d));
                        notify(d.reason || d.status, res.status >= 400);
                      }}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-200"
                    >
                      Test Approval Gate (High-Impact Publish on {activeProject.oauthApps[0].providerKey})
                    </button>
                  </div>
                )}
                {apiActionResult && (
                  <pre className="rounded border border-slate-800 bg-slate-950 p-2 text-[10px] font-mono text-slate-300 whitespace-pre-wrap break-all">
                    {apiActionResult}
                  </pre>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-white">Universal Credential Engineering Ledger ({activeProject.credentials.length} entries · 4 Origins)</h3>
                <div className="max-h-80 overflow-y-auto space-y-1.5">
                  {activeProject.credentials.map(c => (
                    <div key={c.id} className="rounded border border-slate-800 bg-slate-950 px-3 py-2 flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <strong className="text-white font-mono">{c.envVarName}</strong>
                        <span className="ml-2 text-slate-400">({c.providerKey} · {c.credentialType})</span>
                        <div className="text-[10px] text-slate-500">{c.handoverRequirements}</div>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        <span className={`px-2 py-0.5 rounded ${c.origin === 'ALOAPI-GENERATED' ? 'bg-emerald-500/15 text-emerald-300' : c.origin === 'PREPARED-CONFIGURATION' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}>{c.origin}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">{c.activationStatus}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {subTab === 'checkpoints' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-cyan-400" /> Human Input &amp; Official Verification Checkpoints</h3>
          {!activeProject || activeProject.checkpoints.length === 0 ? (
            <p className="text-slate-400">No verification checkpoints generated yet. Prepare providers first.</p>
          ) : (
            <div className="space-y-2">
              {activeProject.checkpoints.map(cp => (
                <div key={cp.id} className="rounded border border-slate-800 bg-slate-950 p-3 flex flex-wrap justify-between items-center gap-2">
                  <div className="max-w-2xl space-y-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-white">{cp.providerKey} — {cp.checkpointType}</strong>
                      <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${cp.status === 'completed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{cp.status}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{cp.instructions}</p>
                    {cp.resumedWorkflowState && <p className="text-[10px] text-cyan-300">Auto-resumed workflow to: {cp.resumedWorkflowState}</p>}
                  </div>
                  <div className="flex gap-2">
                    <a href={cp.officialPortalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-slate-200">
                      Official Portal <ExternalLink className="w-3 h-3" />
                    </a>
                    {cp.status === 'pending' && (
                      <button
                        onClick={async () => {
                          const res = await fetch('/api/engineering/checkpoints', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'complete_and_resume', checkpointId: cp.id, ownerConfirmationNote: 'Verified by owner in official portal' }),
                          });
                          const d = await res.json();
                          if (res.ok) notify(`Verified & auto-resumed workflow -> ${d.resumedWorkflowState}`);
                          else notify(d.error || 'Failed', true);
                          await reload();
                        }}
                        className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2.5 py-1 font-semibold text-slate-950"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Completed &rarr; Resume AI
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'handover' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><PackageCheck className="w-4 h-4 text-cyan-400" /> 17-Section Client Handover &amp; Portability Center</h3>
            {activeProject && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    const res = await fetch('/api/engineering/handover', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'generate_package', projectId: activeProject.id }),
                    });
                    const d = await res.json();
                    if (res.ok) notify(`Generated Handover Package (${d.packageRecord.packageStatus}, secretsIncluded=false).`);
                    else notify(d.error || 'Failed', true);
                    await reload();
                  }}
                  className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-slate-950"
                >
                  Generate Handover Package
                </button>
                <a
                  href={`/api/engineering/handover?projectId=${encodeURIComponent(activeProject.id)}&format=zip`}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-200"
                >
                  <Download className="w-3.5 h-3.5" /> Secret-Free ZIP
                </a>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/engineering/handover', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'export_encrypted_transfer',
                        projectId: activeProject.id,
                        explicitOwnerTransferApproval: true,
                      }),
                    });
                    const d = await res.json();
                    setImportResult(JSON.stringify({ encryptedRecords: d.vaultBackup?.records?.length ?? 0, containsPlaintextSecrets: d.containsPlaintextSecrets }));
                    notify(res.ok ? `Exported ${d.vaultBackup?.records?.length ?? 0} AES-256-GCM envelopes (0 plaintext secrets).` : d.error || 'Failed', !res.ok);
                  }}
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-200"
                >
                  Owner-Authorized AES-256-GCM Vault Transfer
                </button>
              </div>
            )}
          </div>
          {activeProject?.handovers.map(h => (
            <div key={h.id} className="rounded border border-slate-800 bg-slate-950 p-3 space-y-2">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="font-mono text-cyan-300">Status: {h.packageStatus} · Mode: {h.handoverMode} · Secrets Included: {String(h.secretsIncluded)}</span>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/engineering/handover', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'validate_client_import', importManifest: JSON.parse(h.clientImportManifestJson) }),
                    });
                    const d = await res.json();
                    setImportResult(JSON.stringify(d));
                    notify('Client Project Import validation succeeded (original CRM untouched).');
                    await reload();
                  }}
                  className="rounded border border-emerald-500/40 px-2.5 py-1 text-emerald-200"
                >
                  Validate Client Project Import
                </button>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">SHA-256: {h.sha256}</div>
            </div>
          ))}
          {importResult && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 font-mono text-[11px] text-emerald-200">{importResult}</div>}
        </div>
      )}
    </div>
  );
}
