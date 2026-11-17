'use client';

import { useState } from 'react';
import {
  Play,
  Pause,
  Square,
  ShieldCheck,
  KeyRound,
  Download,
  Wrench,
  CheckCircle2,
  RefreshCw,
  Webhook,
  Activity,
  FileCode2,
  AlertTriangle,
} from 'lucide-react';
import type { CatalogProviderItem, OverviewPayload } from './types';

export function OnboardingExecutionViews({
  view,
  overview,
  providers,
  selectedTenant,
  selectedProviderKey,
  onNotify,
  onRefresh,
  onNavigateView,
}: {
  view: string;
  overview: OverviewPayload;
  providers: CatalogProviderItem[];
  selectedTenant: string;
  selectedProviderKey: string;
  onNotify: (msg: string, isErr?: boolean) => void;
  onRefresh: () => void;
  onNavigateView?: (nextView: string) => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState('');
  const [credType, setCredType] = useState('api_key');
  const [credLabel, setCredLabel] = useState('primary');
  const [credSecret, setCredSecret] = useState('');
  const [credExpiryDays, setCredExpiryDays] = useState('90');
  const [docExcerpt, setDocExcerpt] = useState('');
  const [probeOut, setProbeOut] = useState<string | null>(null);
  const [webhookScheme, setWebhookScheme] = useState('meta_hmac_sha256');
  const [webhookPayload, setWebhookPayload] = useState('{"event":"lead.captured","provider":"meta"}');
  const [webhookTestSecret, setWebhookTestSecret] = useState('');
  const [webhookTestOut, setWebhookTestOut] = useState<string | null>(null);
  const [initStepsOut, setInitStepsOut] = useState<{ step: number; title: string; status: string; detail: string }[] | null>(null);

  const activeProvider = providers.find(p => p.key === selectedProviderKey) || providers[0];

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  if (view === 'v5_account_setup') {
    const stepButtons = [
      'DISCOVERY',
      'ACCOUNT_EXISTS',
      'REGISTRATION_REQUIRED',
      'REGISTRATION_PREPARED',
      'AWAITING_OWNER_REVIEW',
      'AWAITING_EMAIL_VERIFICATION',
      'AWAITING_MFA',
      'AWAITING_BUSINESS_VERIFICATION',
      'REGISTRATION_SUBMITTED',
      'ACCOUNT_CREATED',
      'DEVELOPER_SETUP_REQUIRED',
      'AUTHORIZED',
      'CONFIGURED',
      'VERIFIED',
    ];
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Account Setup Center (20-State Machine &amp; Supervised Portal Handoff)</h3>
              <p className="text-xs text-slate-400">
                Tenant: {selectedTenant} · Provider: {activeProvider?.displayName} · Mode: {overview.browserCapability.executionMode}
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await postJson('/api/onboarding/workflows', { action: 'init', tenantId: selectedTenant, providerKey: selectedProviderKey });
                  onNotify(`Initialized workflow for ${selectedProviderKey}`);
                  onRefresh();
                } catch (e) { onNotify((e as Error).message, true); }
              }}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950"
            >
              Initialize 20-State Workflow
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={ownerEmail}
              onChange={e => setOwnerEmail(e.target.value)}
              placeholder="Authorized owner business email..."
              className="flex-1 min-w-[240px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <button
              onClick={async () => {
                try {
                  const res = await postJson('/api/onboarding/browser', {
                    action: 'check_duplicate',
                    tenantId: selectedTenant,
                    providerKey: selectedProviderKey,
                    ownerEmail,
                  });
                  onNotify(res.check.note || `Duplicate risk: ${res.check.existingAccounts.length} existing account(s).`);
                } catch (e) { onNotify((e as Error).message, true); }
              }}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-cyan-500"
            >
              Check Duplicate Accounts
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await postJson('/api/onboarding/browser', {
                    action: 'start',
                    tenantId: selectedTenant,
                    providerKey: selectedProviderKey,
                    ownerEmail,
                    workflowType: 'account_setup',
                  });
                  onNotify(`Started supervised session ${res.session.id} (${res.runtime.executionMode})`);
                  onRefresh();
                } catch (e) { onNotify((e as Error).message, true); }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950"
            >
              <Play className="w-3.5 h-3.5" /> Start Supervised Session
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {overview.workflows.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">No workflows initialized yet.</div>
          ) : overview.workflows.map(wf => (
            <div key={wf.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-sm text-white">{wf.providerKey}</span>
                  <span className="ml-2 text-xs text-slate-400">Tenant: {wf.clientId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-[11px] text-cyan-300">{wf.state}</span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300">Level {wf.implementationLevel}</span>
                </div>
              </div>
              {wf.pendingCheckpoint && <p className="text-xs text-amber-300">Owner Checkpoint: {wf.pendingCheckpoint}</p>}
              {wf.lastError && <p className="text-xs text-red-300">Note: {wf.lastError}</p>}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {stepButtons.map(next => (
                  <button
                    key={next}
                    onClick={async () => {
                      try {
                        await postJson('/api/onboarding/workflows', { action: 'transition', workflowId: wf.id, nextState: next, reason: `Operator transition to ${next}` });
                        onNotify(`Transitioned ${wf.providerKey} -> ${next}`);
                        onRefresh();
                      } catch (e) { onNotify((e as Error).message, true); }
                    }}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-mono text-slate-300 hover:border-cyan-500/50"
                  >
                    -&gt; {next}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {overview.browserSessions.map(s => (
            <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">{s.providerKey} · {s.purpose}</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300">{s.status}</span>
              </div>
              <p className="text-slate-300">{s.currentAction}</p>
              <p className="text-[11px] text-slate-400">Official URL: <a href={s.officialUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">{s.officialUrl}</a></p>
              <div className="flex flex-wrap gap-2 pt-1">
                {(['approve_step', 'pause', 'resume', 'complete', 'cancel'] as const).map(ctrl => (
                  <button
                    key={ctrl}
                    onClick={async () => {
                      try {
                        await postJson('/api/onboarding/browser', { action: ctrl, sessionId: s.id, tenantId: s.clientId });
                        onNotify(`Session ${ctrl} succeeded`);
                        onRefresh();
                      } catch (e) { onNotify((e as Error).message, true); }
                    }}
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-500"
                  >
                    {ctrl === 'pause' ? <Pause className="w-3 h-3" /> : ctrl === 'cancel' ? <Square className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {ctrl}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'v6_dev_portal') {
    if (!activeProvider) return null;
    const redirectUri = typeof window !== 'undefined'
      ? `${window.location.origin}/api/onboarding/oauth/callback`
      : 'http://localhost:47831/api/onboarding/oauth/callback';
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-white">{activeProvider.displayName} — Developer Portal &amp; App Setup</h3>
            <p className="text-xs text-slate-400">Official Developer Portal: <a className="text-cyan-300 underline" href={activeProvider.officialDeveloperPortal} target="_blank" rel="noopener noreferrer">{activeProvider.officialDeveloperPortal}</a></p>
          </div>
          <span className="rounded bg-slate-800 px-2.5 py-1 text-xs font-mono text-cyan-300">{activeProvider.authenticationType}</span>
        </div>
        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs">
          <div className="font-semibold text-cyan-300 mb-1">Permitted OAuth Redirect URI</div>
          <code className="text-slate-200 break-all">{redirectUri}</code>
        </div>
        <div className="grid gap-3 md:grid-cols-2 text-xs">
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
            <div className="font-semibold text-slate-200 mb-1">Developer Account Requirements</div>
            <p className="text-slate-400">{activeProvider.developerAccountRequirements}</p>
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
            <div className="font-semibold text-slate-200 mb-1">Business Verification &amp; App Review</div>
            <p className="text-slate-400">{activeProvider.businessVerificationRequirements}</p>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-200 mb-1">Required Scopes</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {activeProvider.requiredScopes.length === 0 ? (
              <span className="text-xs text-slate-400">API Key / Token scoped on portal</span>
            ) : activeProvider.requiredScopes.map(sc => (
              <span key={sc} className="rounded bg-slate-950 border border-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200">{sc}</span>
            ))}
          </div>
          <div className="text-xs font-semibold text-slate-200 mb-2">Step-by-Step Portal Setup Checklist</div>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300">
            {activeProvider.setupChecklist.map((s, idx) => <li key={idx}>{s}</li>)}
          </ol>
        </div>
      </div>
    );
  }

  if (view === 'v7_oauth') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Official OAuth 2.0 + PKCE Authorization Center</h3>
            <p className="text-xs text-slate-400">Single-use state + S256 PKCE verifier protected in encrypted DB storage; redirects owner directly to official consent screens.</p>
          </div>
          <button
            onClick={async () => {
              try {
                const flow = await postJson('/api/onboarding/oauth', { action: 'create_flow', tenantId: selectedTenant, providerKey: selectedProviderKey });
                onNotify(flow.warning || `OAuth state created (${flow.pkceEnabled ? 'PKCE S256' : 'OAuth2'})`);
                onRefresh();
              } catch (e) { onNotify((e as Error).message, true); }
            }}
            className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950"
          >
            Create PKCE OAuth State ({selectedProviderKey})
          </button>
        </div>
        <div className="space-y-2">
          {overview.oauthStates.map(st => (
            <div key={st.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-white">{st.providerKey}</span>
                <span className="ml-2 text-slate-400">Tenant: {st.clientId} · Expires {new Date(st.expiresAt).toLocaleTimeString()}</span>
              </div>
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300 uppercase">{st.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'v8_vault') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-cyan-400" /> Encrypted Credential Vault (AES-256-GCM · Zero Plaintext Display)</h3>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const res = await postJson('/api/onboarding/vault', { action: 'rotate', tenantId: selectedTenant });
                    onNotify(`Rotated ${res.rotatedCount} encrypted credential(s) cleanly.`);
                    onRefresh();
                  } catch (e) { onNotify((e as Error).message, true); }
                }}
                className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-cyan-400"
              >
                Rotate Keys
              </button>
              <a
                href={`/api/onboarding/vault?mode=backup&tenantId=${encodeURIComponent(selectedTenant)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-slate-700 px-2.5 py-1 text-xs text-cyan-300 hover:border-cyan-400"
              >
                Encrypted Backup JSON
              </a>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            <select value={credType} onChange={e => setCredType(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white">
              <option value="api_key">api_key</option>
              <option value="oauth_client_id">oauth_client_id</option>
              <option value="oauth_client_secret">oauth_client_secret</option>
              <option value="oauth_access_token">oauth_access_token</option>
              <option value="oauth_refresh_token">oauth_refresh_token</option>
              <option value="webhook_secret">webhook_secret</option>
              <option value="account_identifier">account_identifier</option>
              <option value="business_identifier">business_identifier</option>
              <option value="signing_key">signing_key</option>
              <option value="bot_token">bot_token</option>
            </select>
            <input value={credLabel} onChange={e => setCredLabel(e.target.value)} placeholder="Label (e.g. primary)" className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white" />
            <input value={credExpiryDays} onChange={e => setCredExpiryDays(e.target.value)} placeholder="Expires in days" className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white" />
            <input type="password" value={credSecret} onChange={e => setCredSecret(e.target.value)} placeholder="Enter secret value..." className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white" />
            <button
              onClick={async () => {
                try {
                  const days = Number(credExpiryDays);
                  const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : undefined;
                  await postJson('/api/onboarding/vault', {
                    action: 'store',
                    tenantId: selectedTenant,
                    providerKey: selectedProviderKey,
                    credentialType: credType,
                    label: credLabel,
                    value: credSecret,
                    expiresAt,
                  });
                  setCredSecret('');
                  onNotify(`Encrypted and stored ${credType} (${credLabel}) for ${selectedProviderKey}.`);
                  onRefresh();
                } catch (e) { onNotify((e as Error).message, true); }
              }}
              className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
            >
              Encrypt &amp; Store
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {overview.credentials.map(c => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-semibold text-white">{c.providerKey}</span>
                <span className="ml-2 font-mono text-slate-400">{c.credentialType} ({c.label}) · v{c.keyVersion}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-emerald-300">{c.effectiveStatus}</span>
                {!c.revokedAt && (
                  <button
                    onClick={async () => {
                      try {
                        await postJson('/api/onboarding/vault', { action: 'revoke', credentialId: c.id, tenantId: c.tenantId });
                        onNotify('Credential revoked.');
                        onRefresh();
                      } catch (e) { onNotify((e as Error).message, true); }
                    }}
                    className="rounded border border-red-500/40 px-2 py-0.5 text-[11px] text-red-300"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'v9_api_docs') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">{activeProvider?.displayName} — API Documentation Intelligence &amp; Change Detection</h3>
          <textarea
            value={docExcerpt}
            onChange={e => setDocExcerpt(e.target.value)}
            rows={2}
            placeholder="Paste external documentation excerpt to sanitize (untrusted input guard) and hash-index..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white"
          />
          <button
            onClick={async () => {
              try {
                const res = await postJson('/api/onboarding/discovery', { action: 'discover', providerKey: selectedProviderKey, externalDocExcerpt: docExcerpt });
                onNotify(`Discovery snapshot ${res.snapshot.docHash.slice(0, 10)} saved (${res.flaggedDirectives.length} untrusted directive(s) stripped).`);
                onRefresh();
              } catch (e) { onNotify((e as Error).message, true); }
            }}
            className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
          >
            Sync &amp; Sanitize API Snapshot
          </button>
        </div>

        {activeProvider && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
            <div className="font-semibold text-white">Endpoints, Rate Limits &amp; Version ({activeProvider.apiVersion})</div>
            <p className="text-slate-400">Pricing / Limits: {activeProvider.rateLimitsAndPricing}</p>
            <div className="space-y-1 pt-1">
              {activeProvider.apiSpecs.map((ep, i) => (
                <div key={i} className="font-mono text-[11px] bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-slate-300">
                  <span className="text-cyan-400 mr-2">{ep.method}</span>{ep.path} — {ep.summary}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'v10_builder') {
    if (!activeProvider) return null;
    const envTemplate = activeProvider.environmentVariables
      .map(v => `# ${v.purpose}${v.required ? ' (required)' : ''}\n${v.name}=""`)
      .join('\n');
    const canonicalConfig = {
      providerKey: activeProvider.key,
      apiVersion: activeProvider.apiVersion,
      baseUrls: activeProvider.apiBaseUrls,
      authType: activeProvider.authenticationType,
      requiredScopes: activeProvider.requiredScopes,
      retryPolicy: { maxAttempts: 3, backoffMs: [1000, 4000, 15000], respectRetryAfterHeader: true },
      crmBoundary: 'INDEPENDENT_EXPORT_ONLY_NO_AUTO_CRM_WRITE',
    };
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white flex items-center gap-2"><FileCode2 className="w-4 h-4 text-cyan-400" /> Integration Builder — {activeProvider.displayName}</h3>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-300">{activeProvider.adapterImplementationStatus}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="font-semibold text-slate-200 mb-1.5">Secret-Free Environment Template (<code>environment.example</code>)</div>
            <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] text-emerald-300 overflow-x-auto">{envTemplate || '# No env variables defined'}</pre>
          </div>
          <div>
            <div className="font-semibold text-slate-200 mb-1.5">Generated Adapter &amp; Retry Config</div>
            <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] text-cyan-200 overflow-x-auto">{JSON.stringify(canonicalConfig, null, 2)}</pre>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'v11_webhooks') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Webhook className="w-4 h-4 text-cyan-400" /> Webhook Manager &amp; HMAC Signature Verification</h3>
          {activeProvider && (
            <p className="text-slate-300">
              {activeProvider.displayName}: <strong>{activeProvider.webhookSupport.signatureMethod}</strong> · {activeProvider.webhookSupport.verificationMethod}
            </p>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <select value={webhookScheme} onChange={e => setWebhookScheme(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white">
              <option value="meta_hmac_sha256">Meta X-Hub-Signature-256 (HMAC-SHA256)</option>
              <option value="shopify_hmac_sha256">Shopify X-Shopify-Hmac-Sha256 (Base64)</option>
              <option value="stripe_signature">Stripe Stripe-Signature (t=...,v1=...)</option>
              <option value="slack_v0">Slack X-Slack-Signature (v0=...)</option>
              <option value="hubspot_v3">HubSpot X-HubSpot-Signature-v3</option>
              <option value="generic_hmac_sha256">Generic HMAC-SHA256</option>
            </select>
            <input
              type="password"
              value={webhookTestSecret}
              onChange={e => setWebhookTestSecret(e.target.value)}
              placeholder="Optional ephemeral test secret (or uses Vault webhook_secret)..."
              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
            />
          </div>
          <textarea
            value={webhookPayload}
            onChange={e => setWebhookPayload(e.target.value)}
            rows={2}
            className="w-full rounded border border-slate-700 bg-slate-950 p-2.5 font-mono text-white"
          />
          <button
            onClick={async () => {
              try {
                const res = await postJson('/api/onboarding/webhooks', {
                  tenantId: selectedTenant,
                  providerKey: selectedProviderKey,
                  scheme: webhookScheme,
                  payloadRaw: webhookPayload,
                  testSecret: webhookTestSecret || undefined,
                });
                setWebhookTestOut(JSON.stringify(res, null, 2));
                onNotify(res.verified ? 'Webhook signature verified!' : `Webhook check: ${res.result.reason}`, !res.verified);
                onRefresh();
              } catch (e) { onNotify((e as Error).message, true); }
            }}
            className="rounded bg-cyan-500 px-3 py-1.5 font-semibold text-slate-950"
          >
            Test Webhook Signature Verification
          </button>
          {webhookTestOut && <pre className="rounded bg-slate-950 border border-slate-800 p-3 text-[11px] text-cyan-200 overflow-auto">{webhookTestOut}</pre>}
        </div>
      </div>
    );
  }

  if (view === 'v12_omni') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Omni-Routing Queue, Retries &amp; Dead-Letter Inspector</h3>
            <p className="text-xs text-slate-400">Validated schema routing, SHA-256 idempotency, bounded retries, zero shell execution.</p>
          </div>
          <button
            onClick={async () => {
              try {
                await postJson('/api/onboarding/omni-events', {
                  action: 'dispatch',
                  tenantId: selectedTenant,
                  eventType: 'webhook.received',
                  providerKey: selectedProviderKey,
                  sourceChannel: 'admin_console',
                  payload: { pingAt: new Date().toISOString() },
                });
                onNotify('Dispatched idempotent omni-event.');
                onRefresh();
              } catch (e) { onNotify((e as Error).message, true); }
            }}
            className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
          >
            Dispatch Test Event
          </button>
        </div>
        <div className="space-y-2">
          {overview.omniEvents.map(ev => (
            <div key={ev.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-white">{ev.eventName}</span>
                <span className="ml-2 font-mono text-[11px] text-slate-400">attempts: {ev.attempts}/{ev.maxAttempts} · {ev.correlationId.slice(0, 12)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 font-mono text-[10px] ${ev.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{ev.status}</span>
                {ev.status === 'DEAD_LETTER' && (
                  <button
                    onClick={async () => {
                      await postJson('/api/onboarding/omni-events', { action: 'replay', eventId: ev.id });
                      onNotify('Replayed dead-letter event.');
                      onRefresh();
                    }}
                    className="rounded border border-cyan-500/50 px-2 py-0.5 text-[11px] text-cyan-300"
                  >
                    Replay
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'v13_agents') {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {overview.agents.map(ag => (
            <div key={ag.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Agent {ag.code}: {ag.name}</span>
                <button
                  onClick={async () => {
                    try {
                      await postJson('/api/onboarding/agents', {
                        agentCode: ag.code,
                        action: ag.allowedActions[0],
                        tenantId: selectedTenant,
                        providerKey: selectedProviderKey,
                      });
                      onNotify(`Agent ${ag.code} executed ${ag.allowedActions[0]}`);
                      onRefresh();
                    } catch (e) { onNotify((e as Error).message, true); }
                  }}
                  className="rounded bg-cyan-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950"
                >
                  Run {ag.allowedActions[0]}
                </button>
              </div>
              <p className="text-slate-400">{ag.role}</p>
              <p className="text-[11px] text-emerald-300">Allowed: {ag.allowedActions.join(', ')}</p>
              <p className="text-[11px] text-red-300">Forbidden: {ag.forbiddenActions.join(', ')}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-white">Recent Agent Executions</h4>
          {overview.agentRuns.slice(0, 8).map(r => (
            <div key={r.id} className="text-[11px] flex justify-between border-b border-slate-800/70 pb-1 text-slate-300">
              <span>{r.agentId} · {r.action} ({r.providerKey || 'workspace'})</span>
              <span className="font-mono text-cyan-300">{r.status} · {r.durationMs}ms</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'v14_approvals') {
    const pendingWorkflows = overview.workflows.filter(w => w.pendingCheckpoint || w.state.startsWith('AWAITING_') || w.state === 'APP_REVIEW_REQUIRED');
    const pendingSessions = overview.browserSessions.filter(s => s.status === 'WAITING_FOR_OWNER' || s.status === 'PAUSED');
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Owner Approval Checkpoints ({pendingWorkflows.length + pendingSessions.length} pending)</h3>
          <p className="text-xs text-slate-400 mt-1">Legal terms, billing/subscriptions, CAPTCHA/OTP/MFA, business verification, and app review always wait for explicit owner approval.</p>
        </div>
        {pendingWorkflows.map(wf => (
          <div key={wf.id} className="rounded-xl border border-amber-500/30 bg-slate-900 p-4 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-white">{wf.providerKey}</span> · <span className="font-mono text-amber-300">{wf.state}</span>
              <p className="text-slate-300 mt-0.5">{wf.pendingCheckpoint || 'Awaiting owner review / confirmation'}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    await postJson('/api/onboarding/workflows', { action: 'transition', workflowId: wf.id, nextState: 'ACCOUNT_CREATED', reason: 'Owner approved checkpoint' });
                    onNotify(`Approved checkpoint for ${wf.providerKey}`);
                    onRefresh();
                  } catch (e) { onNotify((e as Error).message, true); }
                }}
                className="rounded bg-emerald-500 px-3 py-1 font-semibold text-slate-950"
              >
                Approve &amp; Advance
              </button>
            </div>
          </div>
        ))}
        {pendingSessions.map(s => (
          <div key={s.id} className="rounded-xl border border-cyan-500/30 bg-slate-900 p-4 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-white">{s.providerKey}</span> · <span className="font-mono text-cyan-300">{s.status}</span>
              <p className="text-slate-300 mt-0.5">{s.currentAction}</p>
            </div>
            <button
              onClick={async () => {
                await postJson('/api/onboarding/browser', { action: 'approve_step', sessionId: s.id, tenantId: s.clientId });
                onNotify('Owner checkpoint approved.');
                onRefresh();
              }}
              className="rounded bg-cyan-500 px-3 py-1 font-semibold text-slate-950"
            >
              Approve Browser Step
            </button>
          </div>
        ))}
        {pendingWorkflows.length === 0 && pendingSessions.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">No pending owner approval checkpoints right now.</div>
        )}
      </div>
    );
  }

  if (view === 'v15_health') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> System Health &amp; Runtime Readiness</h3>
          {onNavigateView && (
            <button onClick={() => onNavigateView('v16_healing')} className="rounded border border-cyan-500/40 px-2.5 py-1 text-cyan-300">Open Self-Healing Center</button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
            <div className="text-slate-400">Vault Crypto</div>
            <div className={`mt-1 font-mono font-semibold ${overview.vaultReady ? 'text-emerald-300' : 'text-red-300'}`}>{overview.vaultReady ? 'AES-256-GCM ACTIVE' : 'KEY MISSING'}</div>
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
            <div className="text-slate-400">Browser Engine</div>
            <div className="mt-1 font-mono text-cyan-300">{overview.browserCapability.executionMode}</div>
          </div>
          <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
            <div className="text-slate-400">Catalog Version</div>
            <div className="mt-1 font-mono text-white">{overview.catalogSummary.version} ({overview.catalogSummary.total} records)</div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'v16_healing') {
    const latestInit = overview.initRuns[0];
    const parsedSteps = initStepsOut || (() => {
      try { return latestInit ? JSON.parse(latestInit.steps) : []; } catch { return []; }
    })();
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-wrap gap-2 items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Self-Healing Center (13-Step Initialization &amp; Backup-First Safe Repair)</h3>
            <p className="text-xs text-slate-400">Protected paths (.env, DB, vault keys, providers/, migrations) are never modified automatically.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                const res = await postJson('/api/onboarding/system', { action: 'initialize' });
                setInitStepsOut(res.init.steps);
                onNotify(`Initialization finished: ${res.init.overallStatus}`);
                onRefresh();
              }}
              className="inline-flex items-center gap-1 rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Run 13-Step Init
            </button>
            <button
              onClick={async () => {
                const res = await postJson('/api/onboarding/system', { action: 'integrity_check' });
                onNotify(`Integrity: ${res.report.healthyCount} healthy, ${res.report.repairableCount} repairable, ${res.report.approvalRequiredCount} approval required.`);
                onRefresh();
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200"
            >
              <Wrench className="w-3.5 h-3.5" /> Run Integrity Audit
            </button>
            <button
              onClick={async () => {
                const res = await postJson('/api/onboarding/system', { action: 'safe_repair', targets: ['exports', 'backups', '.env.example'] });
                onNotify(`Repaired ${res.repairs.filter((r: { repaired: boolean }) => r.repaired).length} deterministic artifact(s) with backup.`);
                onRefresh();
              }}
              className="rounded border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300"
            >
              Safe Deterministic Repair
            </button>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {parsedSteps.map((s: { step: number; title: string; status: string; detail: string }) => (
            <div key={s.step} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs">
              <div className="flex justify-between">
                <span className="font-semibold text-white">{s.step}. {s.title}</span>
                <span className={`font-mono ${s.status === 'PASS' ? 'text-emerald-300' : s.status === 'WARN' ? 'text-amber-300' : 'text-red-300'}`}>{s.status}</span>
              </div>
              <p className="mt-1 text-slate-400">{s.detail}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {overview.integrityRecords.slice(0, 8).map(rec => (
            <div key={rec.id} className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs flex justify-between">
              <span className="text-slate-300">[{rec.target}] {rec.detail}</span>
              <span className="font-mono text-cyan-300">{rec.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'v17_verify') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-xs">
        <h3 className="text-sm font-semibold text-white">Verification Center — Honest Read-Only Provider API &amp; Expiry Check</h3>
        <p className="text-slate-300">Never fabricates live platform connectivity: refuses to claim verification unless an active Vault token succeeds against an official HTTPS endpoint.</p>
        <button
          onClick={async () => {
            try {
              const res = await postJson('/api/onboarding/discovery', { action: 'verify_live', tenantId: selectedTenant, providerKey: selectedProviderKey });
              setProbeOut(JSON.stringify(res.verification, null, 2));
              onNotify(`Probe status: ${res.verification.status}`);
            } catch (e) { onNotify((e as Error).message, true); }
          }}
          className="inline-flex items-center gap-1.5 rounded bg-cyan-500 px-3.5 py-2 font-semibold text-slate-950"
        >
          <ShieldCheck className="w-4 h-4" /> Run Honest Read-Only Probe ({selectedProviderKey})
        </button>
        {probeOut && <pre className="rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] text-cyan-200 overflow-auto">{probeOut}</pre>}
      </div>
    );
  }

  if (view === 'v18_export') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <h3 className="text-base font-semibold text-white">Secret-Free Multi-File Export Package Center</h3>
        <p className="text-xs text-slate-300">
          Downloads verified setup bundles containing <code>provider.json</code>, <code>account-setup.md</code>, <code>api-documentation.md</code>, <code>authentication.md</code>, <code>permissions.json</code>, <code>environment.example</code>, <code>webhook-configuration.json</code>, <code>integration-config.json</code>, API schemas, example requests, validation reports, source references, version metadata, and <code>SHA256SUMS</code>. Zero plaintext secrets are ever exported.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/onboarding/export?providerKey=${encodeURIComponent(selectedProviderKey)}&tenantId=${encodeURIComponent(selectedTenant)}&format=zip`} className="inline-flex items-center gap-1.5 rounded bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950">
            <Download className="w-3.5 h-3.5" /> {selectedProviderKey} Bundle (.zip)
          </a>
          <a href={`/api/onboarding/export?providerKey=${encodeURIComponent(selectedProviderKey)}&tenantId=${encodeURIComponent(selectedTenant)}&format=json`} className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-2 text-xs text-slate-200">
            JSON (.json)
          </a>
          <a href={`/api/onboarding/export?providerKey=${encodeURIComponent(selectedProviderKey)}&tenantId=${encodeURIComponent(selectedTenant)}&format=yaml`} className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-2 text-xs text-slate-200">
            YAML (.yaml)
          </a>
          <a href={`/api/onboarding/export?providerKey=${encodeURIComponent(selectedProviderKey)}&tenantId=${encodeURIComponent(selectedTenant)}&format=markdown`} className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-2 text-xs text-slate-200">
            Markdown (.md)
          </a>
          <a href={`/api/onboarding/export?providerKey=${encodeURIComponent(selectedProviderKey)}&tenantId=${encodeURIComponent(selectedTenant)}&format=csv`} className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-2 text-xs text-slate-200">
            CSV (.csv)
          </a>
          <a href={`/api/onboarding/export?format=zip`} className="inline-flex items-center gap-1.5 rounded border border-cyan-500/40 px-3 py-2 text-xs text-cyan-300">
            Full {providers.length}-Provider Catalog (.zip)
          </a>
          <a href={`/api/onboarding/export?format=csv`} className="inline-flex items-center gap-1.5 rounded border border-cyan-500/40 px-3 py-2 text-xs text-cyan-300">
            Full Catalog (.csv)
          </a>
        </div>
      </div>
    );
  }

  // v19_audit
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-white">Security, Compliance &amp; Tenant Audit Trail</h3>
      <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
        {overview.auditLogs.map(log => (
          <div key={log.id} className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] flex flex-wrap justify-between gap-2">
            <span className="text-cyan-300 font-mono">{log.action}</span>
            <span className="text-slate-300 truncate max-w-[480px]">{log.detail}</span>
            <span className="text-slate-500">{log.actor} · {new Date(log.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
