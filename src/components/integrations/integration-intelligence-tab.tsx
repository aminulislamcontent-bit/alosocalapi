'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, Check, Download, ExternalLink, FileText, KeyRound, LoaderCircle, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { encryptCredentialForTransfer } from '@/lib/security/credential-transfer-client';

type Provider = {
  key: string;
  name: string;
  category: string;
  verificationStatus: string;
  collectedAt: string;
  officialDocs: { label: string; url: string }[];
  apiBaseUrls: string[];
  authentication: string[];
  oauthScopes: string[];
  applicationRequirements: string;
  accountRequirements: string;
  endpoints: string[];
  webhooks: string;
  rateLimitsAndPricing: string;
  developerApproval: string;
  environmentVariables: { name: string; secret: boolean; required: boolean; purpose: string }[];
  automationCapabilities: string[];
  restrictions: string[];
  productionNotes: string;
  recordedAccounts: number;
  configuredAccounts: number;
  authorizedAccounts: number;
  verifiedAccounts: number;
};

type RegistryResponse = {
  providers: Provider[];
  liveProviderChecksPerformed: boolean;
  oauthAuthorizationsPerformed: boolean;
  whatsappAuthorizationFlowAvailable: boolean;
  stateNote: string;
};

type WebhookStatus = {
  appSecretConfigured: boolean;
  verifyTokenConfigured: boolean;
  fullyConfigured: boolean;
  providerAuthorizationPerformed: false;
  messagesSent: false;
};

const CATEGORY_LABELS: Record<string, string> = {
  social: 'Social & messaging',
  marketing: 'Marketing',
  business: 'Business services',
  automation: 'Automation',
  'agent-library': 'Agent libraries',
  infrastructure: 'Infrastructure',
  research: 'Research & discovery',
};

const EMPTY_WEBHOOK: WebhookStatus = {
  appSecretConfigured: false,
  verifyTokenConfigured: false,
  fullyConfigured: false,
  providerAuthorizationPerformed: false,
  messagesSent: false,
};

function ProviderList({ values, selectedKey, onSelect }: { values: Provider[]; selectedKey: string; onSelect: (key: string) => void }) {
  return <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
    {values.map(provider => <button
      key={provider.key}
      type="button"
      onClick={() => onSelect(provider.key)}
      className={`rounded-xl border p-3 text-left transition ${selectedKey === provider.key ? 'border-cyan-400/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-100">{provider.name}</span>
          <span className="mt-1 block font-mono text-[10px] text-slate-500">{provider.key}</span>
        </span>
        <span className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400">{provider.verificationStatus}</span>
      </span>
      <span className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
        <span>{CATEGORY_LABELS[provider.category] ?? provider.category}</span>
        <span>·</span><span>{provider.officialDocs.length} official link(s)</span>
        {provider.recordedAccounts > 0 && <><span>·</span><span>{provider.recordedAccounts} local record(s)</span></>}
      </span>
    </button>)}
  </div>;
}

function ProviderDetails({ provider }: { provider: Provider }) {
  const list = (items: string[]) => items.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Not established in this catalog.</p>;
  return <article className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-bold text-white">{provider.name}</h3><p className="mt-1 font-mono text-xs text-slate-500">{provider.key} · catalog entry: {provider.verificationStatus}</p></div>
        <span className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200">Local records: {provider.recordedAccounts} · configured: {provider.configuredAccounts} · authorized: 0 · verified: 0</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{provider.productionNotes}</p>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">Official documentation</h4>
        {provider.officialDocs.length ? <ul className="mt-2 space-y-2">{provider.officialDocs.map(doc => <li key={doc.url}><a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-cyan-300 hover:text-cyan-200">{doc.label}<ExternalLink className="h-3.5 w-3.5" /></a></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No official URL verified.</p>}
      </section>
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">OAuth scopes & authentication</h4>
        {list(provider.authentication)}
        {provider.oauthScopes.length ? <ul className="mt-3 flex flex-wrap gap-2">{provider.oauthScopes.map(scope => <li key={scope} className="rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-1 font-mono text-[11px] text-cyan-200">{scope}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No OAuth scopes listed.</p>}
      </section>
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">Application requirements</h4><p className="mt-2 text-sm leading-relaxed text-slate-300">{provider.applicationRequirements}</p><h4 className="mt-4 font-semibold text-slate-100">Account requirements</h4><p className="mt-2 text-sm leading-relaxed text-slate-300">{provider.accountRequirements}</p></section>
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">Documented endpoint examples</h4>{list(provider.endpoints)}<p className="mt-4 text-sm text-slate-300"><strong className="text-slate-100">Webhook:</strong> {provider.webhooks}</p></section>
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">Permissions & approval</h4><p className="mt-2 text-sm leading-relaxed text-slate-300">{provider.developerApproval}</p><p className="mt-3 text-sm leading-relaxed text-slate-300"><strong className="text-slate-100">Rate limits/pricing:</strong> {provider.rateLimitsAndPricing}</p></section>
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">Blank environment key inventory</h4>
        {provider.environmentVariables.length ? <ul className="mt-2 space-y-2">{provider.environmentVariables.map(item => <li key={item.name} className="flex flex-wrap items-start justify-between gap-2 text-xs"><span><code className="font-mono text-cyan-200">{item.name}</code><span className="ml-2 text-slate-500">{item.secret ? 'secret' : 'identifier/config'}{item.required ? ' · required for documented flow' : ' · optional'}</span><span className="mt-1 block text-slate-400">{item.purpose}</span></span><span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">value omitted</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No keys listed.</p>}
      </section>
    </div>
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">Documented automation capabilities</h4>{list(provider.automationCapabilities)}</div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"><h4 className="font-semibold text-slate-100">Restrictions & cautions</h4>{list(provider.restrictions)}</div>
    </section>
  </article>;
}

export default function IntegrationIntelligenceTab() {
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState('whatsapp_cloud_api');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [webhook, setWebhook] = useState<WebhookStatus>(EMPTY_WEBHOOK);
  const [appSecret, setAppSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [transferPassphrase, setTransferPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [registryResponse, webhookResponse] = await Promise.all([
        fetch('/api/integrations', { cache: 'no-store', credentials: 'same-origin' }),
        fetch('/api/integrations/whatsapp/webhook-credentials', { cache: 'no-store', credentials: 'same-origin' }),
      ]);
      const [registryData, webhookData] = await Promise.all([registryResponse.json(), webhookResponse.json()]);
      if (!registryResponse.ok) throw new Error(registryData.error ?? 'Could not load the provider registry.');
      if (!webhookResponse.ok) throw new Error(webhookData.error ?? 'Could not load webhook verifier status.');
      const result = registryData as RegistryResponse;
      setRegistry(result);
      setWebhook(webhookData.webhookVerifier as WebhookStatus);
      if (!result.providers.some(provider => provider.key === selectedKey)) setSelectedKey(result.providers[0]?.key ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Provider registry unavailable.');
    }
  }, [selectedKey]);

  // Populate the registry from authenticated, same-origin GETs after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => [...new Set((registry?.providers ?? []).map(provider => provider.category))].sort(), [registry]);
  const visibleProviders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (registry?.providers ?? []).filter(provider => {
      const categoryMatch = category === 'all' || provider.category === category;
      const textMatch = !needle || `${provider.key} ${provider.name} ${provider.category}`.toLowerCase().includes(needle);
      return categoryMatch && textMatch;
    });
  }, [category, registry, search]);
  const selectedProvider = registry?.providers.find(provider => provider.key === selectedKey) ?? visibleProviders[0] ?? null;

  const downloadExport = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/export', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not create the integration package.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'aloapi-integration-intelligence.tar.gz';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice(`Offline package downloaded. SHA-256: ${response.headers.get('X-ALOAPI-Package-SHA256') ?? 'see package manifest'}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create the integration package.'); }
    finally { setBusy(false); }
  };

  const saveWebhookSecrets = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (new TextEncoder().encode(transferPassphrase).length < 16) throw new Error('Choose a unique transfer passphrase of at least 16 UTF-8 bytes. Do not use your Meta password.');
      const [appSecretTransfer, verifyTokenTransfer] = await Promise.all([
        encryptCredentialForTransfer(appSecret, transferPassphrase),
        encryptCredentialForTransfer(verifyToken, transferPassphrase),
      ]);
      const response = await fetch('/api/integrations/whatsapp/webhook-credentials', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appSecretTransfer, verifyTokenTransfer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Webhook settings could not be saved.');
      setWebhook(data.webhookVerifier as WebhookStatus);
      setAppSecret(''); setVerifyToken(''); setTransferPassphrase('');
      setNotice('Webhook verifier secrets were stored encrypted at rest. This did not authorize a WhatsApp account or enable message sending.');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Webhook settings could not be saved.'); }
    finally {
      setAppSecret(''); setVerifyToken(''); setTransferPassphrase('');
      setBusy(false);
    }
  };

  const removeWebhookSecrets = async () => {
    if (!window.confirm('Delete ALOAPI’s local copies of the two webhook verifier secrets? This does not revoke anything in Meta.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations/whatsapp/webhook-credentials', { method: 'DELETE', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Local webhook secrets could not be removed.');
      setWebhook(data.webhookVerifier as WebhookStatus);
      setNotice('ALOAPI local webhook verifier copies were deleted. Meta permissions were not changed.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Local webhook secrets could not be removed.'); }
    finally { setBusy(false); }
  };

  const whatsapp = registry?.providers.find(provider => provider.key === 'whatsapp_cloud_api');

  return <div className="space-y-5 text-slate-100">
    <header className="rounded-2xl border border-cyan-500/20 bg-slate-900/80 p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div><h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-5 w-5 text-cyan-400" />Integration Intelligence</h2><p className="mt-1 text-sm text-slate-400">Official API documentation, setup requirements, OAuth permission checklists, webhook guidance, and offline export. No provider login or live connection is performed.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
          <button type="button" onClick={() => void downloadExport()} disabled={busy || !registry} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"><Download className="h-3.5 w-3.5" />Export offline package</button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 text-amber-200">Provider authorization: NOT PERFORMED</span>
        <span className="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 text-amber-200">Live checks: NONE</span>
        <span className="rounded border border-slate-700 px-2.5 py-1 text-slate-400">Authorized accounts: 0 · verified accounts: 0</span>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">{notice}</p>}
      {registry?.stateNote && <p className="mt-3 text-xs leading-relaxed text-slate-500">{registry.stateNote}</p>}
    </header>

    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><h3 className="font-semibold text-white">Provider registry</h3><p className="mt-1 text-xs text-slate-500">{registry?.providers.length ?? 0} catalog entries · documentation status is not account status.</p></div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2"><Search className="h-4 w-4 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search provider or category" className="min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-600" aria-label="Search providers" /></label>
      </div>
      <div className="mb-4 flex flex-wrap gap-2"><button type="button" onClick={() => setCategory('all')} className={`rounded-full px-3 py-1 text-xs ${category === 'all' ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-400'}`}>All categories</button>{categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-3 py-1 text-xs ${category === item ? 'bg-cyan-500 text-slate-950' : 'border border-slate-700 text-slate-400'}`}>{CATEGORY_LABELS[item] ?? item}</button>)}</div>
      {registry ? <ProviderList values={visibleProviders} selectedKey={selectedProvider?.key ?? ''} onSelect={setSelectedKey} /> : <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading catalog…</div>}
      {visibleProviders.length === 0 && registry && <p className="mt-4 text-sm text-slate-500">No providers match this search.</p>}
    </section>

    {selectedProvider && <ProviderDetails provider={selectedProvider} />}

    {whatsapp && <section className="space-y-5 rounded-2xl border border-emerald-500/20 bg-slate-900/80 p-5">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold text-white"><FileText className="h-5 w-5 text-emerald-400" />WhatsApp Business setup &amp; handoff</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">Complete account selection, ownership review, app permissions, and any OAuth grant only in Meta’s official Business/Developer interfaces. This deployment has no WhatsApp OAuth flow and does not request a phone number, WABA ID, Phone Number ID, or access token. A phone number is not authorization.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <h4 className="font-semibold text-white">Manual owner checklist</h4>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Use the official Meta Business and developer consoles with an authorized business administrator.</li>
            <li>Review the currently available WhatsApp Business Platform product, app roles, business verification, requested permissions, and app-review requirements.</li>
            <li>Choose a number and WABA only inside the authorized Meta flow; ALOAPI does not infer ownership or access from a supplied number.</li>
            <li>For webhooks, provide an owner-managed public HTTPS callback to Meta. This service itself binds to loopback; no public callback URL or tunnel is configured here.</li>
            <li>After app/webhook setup, verify permissions and business eligibility in Meta. No messages are sent by this assistant.</li>
          </ol>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-100">No client/WABA/phone IDs or access tokens can be saved here until an actual authorized Meta authentication flow exists. The webhook verifier below is separate from account authorization.</div>
          <p className="text-xs text-slate-500">Local webhook endpoint path: <code className="font-mono text-slate-300">/api/webhooks/whatsapp</code>. Its handler validates Meta’s signed webhook payload and stores event names only; it does not store raw bodies or send messages.</p>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 font-semibold text-white"><KeyRound className="h-4 w-4 text-emerald-400" />Webhook verifier vault</h4><span className={`rounded border px-2 py-1 text-[10px] ${webhook.fullyConfigured ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-200'}`}>{webhook.fullyConfigured ? 'LOCAL SETTINGS PRESENT' : 'REQUIRES SETUP'}</span></div>
          <p className="text-xs leading-relaxed text-slate-400">Optional, limited to the Meta app secret used to verify webhook signatures and a locally chosen webhook verification token. Values are encrypted in the browser for transfer and encrypted at rest. They are write-only here—never revealed, exported, or returned. This does not connect or authorize a WhatsApp account.</p>
          <form onSubmit={saveWebhookSecrets} className="space-y-3">
            <label className="block text-xs text-slate-400">Meta App Secret <span className="text-slate-600">· from the official Meta app settings</span><input type="password" autoComplete="off" required value={appSecret} onChange={event => setAppSecret(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" /></label>
            <label className="block text-xs text-slate-400">Webhook Verify Token <span className="text-slate-600">· choose a unique random value, 32+ bytes</span><input type="password" autoComplete="off" required minLength={32} value={verifyToken} onChange={event => setVerifyToken(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" /></label>
            <label className="block text-xs text-slate-400">One-time transfer passphrase <span className="text-slate-600">· 16+ bytes; not your Meta password</span><input type="password" autoComplete="new-password" required minLength={16} value={transferPassphrase} onChange={event => setTransferPassphrase(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" /></label>
            <div className="flex flex-wrap gap-2"><button disabled={busy || !appSecret || !verifyToken || !transferPassphrase} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Save encrypted verifier settings</button>
              {webhook.fullyConfigured && <button type="button" disabled={busy} onClick={() => void removeWebhookSecrets()} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-200 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete local copies</button>}
            </div>
          </form>
          <p className="rounded-lg border border-slate-800 p-3 text-xs text-slate-500">Current state: app secret {webhook.appSecretConfigured ? 'stored' : 'not stored'}; verify token {webhook.verifyTokenConfigured ? 'stored' : 'not stored'}; provider authorization not performed; messages sent: no.</p>
        </div>
      </div>
    </section>}

    <footer className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-500"><AlertTriangle className="mr-2 inline h-4 w-4 text-amber-400" />This catalog is a documentation assistant, not a live integration agent. Re-check provider versions, prices, approval requirements, legal terms, scopes, and regional availability in official interfaces. Exported templates contain no credentials, account IDs, phone numbers, raw webhook payloads, or plaintext secrets.</footer>
  </div>;
}
