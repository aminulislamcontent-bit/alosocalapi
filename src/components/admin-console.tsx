'use client';

import { useState } from 'react';
import {
  Radar,
  LayoutGrid,
  Target,
  Rocket,
  ShieldCheck,
  Key,
  Lock,
  Download,
  ExternalLink,
  AlertTriangle,
  Smartphone,
  FileText,
  Layers,
  ChevronRight,
  Sparkles,
  Users,
  GraduationCap,
  ListTodo,
  Bot,
  LogOut
} from 'lucide-react';
import ClientAccessTab from '@/components/portal/client-access-tab';
import CrmTab from '@/components/crm/crm-tab';
import CrmTasksTab from '@/components/crm/crm-tasks-tab';
import AutomationsTab from '@/components/crm/automations-tab';
import SetupBotAdminTab from '@/components/setupbot/setupbot-admin';
import EngineTab from '@/components/engine/engine-tab';
import { BUSINESS } from '@/lib/business';
import IntegrationIntelligenceTab from '@/components/integrations/integration-intelligence-tab';
import AdminSecurityTab from '@/components/admin/admin-security-tab';
import { PLATFORMS_CONFIG } from '@/lib/vault-data';
import DashboardTab from '@/components/dashboard-tab';
import ChannelsTab from '@/components/channels-tab';
import PlannerTab from '@/components/planner-tab';
import { usePersistentState } from '@/lib/usePersistentState';
import { CHANNELS, LAUNCH_PHASES, type CompanyProfile, type ChannelStatusMap } from '@/lib/channels-data';

type TabId = 'access' | 'crm' | 'tasks' | 'automation' | 'setupbot' | 'engine' | 'integrations' | 'security' | 'dashboard' | 'channels' | 'planner' | 'wizard' | 'credentials' | 'otp' | 'rotation' | 'env';

export default function AdminConsole({ onLogout }: { onLogout: () => void }) {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('access');

  // Company profile and manual channel checklist are local browser notes; no provider state is inferred.
  const [company, setCompany] = usePersistentState<CompanyProfile>('aia-company-v1', { name: '', niche: '', audience: '', budget: '' });
  const [channelStatus, setChannelStatus] = usePersistentState<ChannelStatusMap>('aia-channel-status-v1', {});
  // The retired XX placeholder IDs remain untouched in legacy browser storage, but are no longer read or displayed.

  // Local status reports are manual planning notes only, never provider verification.
  const [toastMessage, setToastMessage] = useState<{ msg: string; type: string } | null>(null);

  const showToast = (msg: string, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };


  // Template only: values are deliberately blank and never include browser-held secrets.
  const generateEnvString = () => {
    const lines = [
      '# ALOAPI integration template — blank values only.',
      '# Store real secrets in the encrypted server-side vault, never in Git or browser storage.',
      'ALOAPI_HOST="127.0.0.1"', 'ALOAPI_PORT="47831"', 'ALOAPI_VAULT_KEY=""', '',
    ];
    const names = new Set<string>();
    for (const platform of PLATFORMS_CONFIG) {
      lines.push(`# ${platform.name}`);
      for (const field of platform.fields) if (!names.has(field.key)) { names.add(field.key); lines.push(`${field.key}=""`); }
      lines.push('');
    }
    return lines.join('\n');
  };

  const downloadEnvFile = () => {
    const file = new Blob([generateEnvString()], { type: 'text/plain' });
    const url = URL.createObjectURL(file); const element = document.createElement('a');
    element.href = url; element.download = '.env.example'; element.click(); URL.revokeObjectURL(url);
    showToast('Downloaded a blank environment template.');
  };

  // Local planning checklist only; this never reads or changes provider state.
  const toggleChannelChecklist = (channelId: string) => {
    setChannelStatus(prev => {
      const cur = prev[channelId] ?? { live: false, handle: '' };
      return { ...prev, [channelId]: { ...cur, live: !cur.live } };
    });
  };

  const setChannelHandle = (channelId: string, handle: string) => {
    setChannelStatus(prev => {
      const cur = prev[channelId] ?? { live: false, handle: '' };
      return { ...prev, [channelId]: { ...cur, handle } };
    });
  };


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-900 pb-16">

      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/90 border border-cyan-500/40 text-cyan-200 shadow-2xl shadow-cyan-950/50 backdrop-blur-md animate-bounce">
          {toastMessage.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          ) : (
            <Sparkles className="w-5 h-5 text-cyan-400" />
          )}
          <span className="text-sm font-medium">{toastMessage.msg}</span>
        </div>
      )}

      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Logo & Platform Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Radar className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">{BUSINESS.name}</h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Local admin · private service
                </span>
              </div>
              <p className="text-xs text-slate-400">{BUSINESS.email} • {BUSINESS.phone}</p>
            </div>
          </div>

          {/* Honest integration status; no OTP/SMS gateway is configured in this workspace. */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400"></span>
              <span className="text-slate-300">Provider access: <strong className="text-amber-300">NOT VERIFIED</strong></span>
            </div>
            <button
              onClick={() => setActiveTab('env')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-sans font-semibold text-xs hover:opacity-95 transition-all shadow-md shadow-cyan-500/20"
            >
              <FileText className="w-3.5 h-3.5" />
              Blank .env template
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs hover:text-red-300 hover:border-red-500/30 transition-all"
              aria-label="লগআউট"
            >
              <LogOut className="w-3.5 h-3.5" />
              লগআউট
            </button>
          </div>

        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-medium border-t border-slate-800/60 pt-3">
          <button
            onClick={() => setActiveTab('access')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap relative font-semibold ${
              activeTab === 'access'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            ক্লায়েন্ট অ্যাক্সেস
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">NEW</span>
          </button>

          <button
            onClick={() => setActiveTab('crm')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap relative font-semibold ${
              activeTab === 'crm'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            CRM পাইপলাইন
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">NEW</span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap relative font-semibold ${
              activeTab === 'tasks'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            ফলো-আপ টাস্ক
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">NEW</span>
          </button>

          <button
            onClick={() => setActiveTab('automation')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap relative font-semibold ${
              activeTab === 'automation'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Bot className="w-4 h-4" />
            অটোমেশন ও নলেজ বেস
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">NEW</span>
          </button>

          <button
            onClick={() => setActiveTab('setupbot')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap relative font-semibold ${
              activeTab === 'setupbot'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Bot className="w-4 h-4" />
            SetupBot Pro
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">NEW</span>
          </button>

          <button
            onClick={() => setActiveTab('engine')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap relative font-semibold ${
              activeTab === 'engine'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Radar className="w-4 h-4" />
            গ্রোথ ইঞ্জিন
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">NEW</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'integrations'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            API Intelligence
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'security'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            Security
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Ops Dashboard
          </button>

          <button
            onClick={() => setActiveTab('channels')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'channels'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Target className="w-4 h-4" />
            Channel Matrix ({CHANNELS.length})
          </button>

          <button
            onClick={() => setActiveTab('planner')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'planner'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Rocket className="w-4 h-4" />
            Launch Planner
            {(() => {
              const allIds = Array.from(new Set(LAUNCH_PHASES.flatMap(p => p.steps.map(s => s.channelId))));
              const remaining = allIds.filter(id => !channelStatus[id]?.live).length;
              if (remaining === 0) return null;
              return (
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-mono">{remaining}</span>
              );
            })()}
          </button>

          <button
            onClick={() => setActiveTab('wizard')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'wizard'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Access Workflow
          </button>

          <button
            onClick={() => setActiveTab('credentials')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'credentials'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Key className="w-4 h-4" />
            Official setup references ({PLATFORMS_CONFIG.length})
          </button>

          <button
            onClick={() => setActiveTab('otp')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap relative ${
              activeTab === 'otp'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Provider MFA guidance
          </button>

          <button
            onClick={() => setActiveTab('rotation')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'rotation'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            Provider account security
          </button>

          <button
            onClick={() => setActiveTab('env')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'env'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            Blank .env template
          </button>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 pt-6">

        {activeTab === 'access' && <ClientAccessTab />}

        {activeTab === 'crm' && <CrmTab />}
        {activeTab === 'tasks' && <CrmTasksTab />}
        {activeTab === 'automation' && <AutomationsTab />}
        {activeTab === 'setupbot' && <SetupBotAdminTab />}
        {activeTab === 'engine' && <EngineTab showToast={showToast} />}
        {activeTab === 'integrations' && <IntegrationIntelligenceTab />}
        {activeTab === 'security' && <AdminSecurityTab onLogout={onLogout} />}

        {activeTab !== 'access' && activeTab !== 'crm' && activeTab !== 'tasks' && activeTab !== 'automation' && activeTab !== 'setupbot' && activeTab !== 'engine' && activeTab !== 'integrations' && activeTab !== 'security' && (
        <>
        <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">
          <strong>State boundary:</strong> this dashboard's launch checkboxes are local planning notes. They are not provider status. API Intelligence records only user-supplied setup data; no provider authorization or live verification has been performed here.
        </div>

        {/* TAB 0: OPS DASHBOARD */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            company={company}
            onCompanyChange={setCompany}
            channelStatus={channelStatus}
            onGoTo={(tab) => setActiveTab(tab)}
          />
        )}

        {/* TAB 0b: MARKETING CHANNEL MATRIX */}
        {activeTab === 'channels' && (
          <ChannelsTab
            channelStatus={channelStatus}
            onToggleChecklist={toggleChannelChecklist}
            onSetHandle={setChannelHandle}
          />
        )}

        {/* TAB 0c: NEW COMPANY LAUNCH PLANNER */}
        {activeTab === 'planner' && (
          <PlannerTab
            channelStatus={channelStatus}
            onToggleChecklist={toggleChannelChecklist}
            onOpenIntegrations={() => setActiveTab('integrations')}
          />
        )}

        {activeTab === 'wizard' && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-cyan-500/20 bg-slate-900 p-5">
              <h2 className="flex items-center gap-2 text-xl font-bold text-white"><Layers className="h-5 w-5 text-cyan-400" />Authorized integration workflow</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">ALOAPI does not automate provider login, intercept MFA, or claim token exchange. Use each provider&apos;s official authorization experience and make only actions you explicitly approve.</p>
            </div>
            <ol className="grid gap-4 lg:grid-cols-3">
              <li className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="font-mono text-xs text-cyan-300">01 · DISCOVERED → DOCUMENTED</p>
                <h3 className="mt-2 font-semibold text-white">Review official requirements</h3>
                <p className="mt-2 text-sm text-slate-400">Check the selected API&apos;s official documentation, OAuth scopes, app-review requirements, business eligibility, policy and current limits.</p>
              </li>
              <li className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="font-mono text-xs text-amber-300">02 · CONFIGURED</p>
                <h3 className="mt-2 font-semibold text-white">Record only owner-authorized data</h3>
                <p className="mt-2 text-sm text-slate-400">The account owner signs in directly to the provider. ALOAPI never requests a provider password, OTP or recovery code; saved secrets use an ephemeral encrypted transfer passphrase and server-side vault encryption.</p>
              </li>
              <li className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="font-mono text-xs text-emerald-300">03 · AUTHORIZED / VERIFIED</p>
                <h3 className="mt-2 font-semibold text-white">Require evidence before claiming status</h3>
                <p className="mt-2 text-sm text-slate-400">This workspace has no provider OAuth callback or live read-only verification adapter. Treat authorization and verification as user action required; no result is inferred from a saved credential.</p>
              </li>
            </ol>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <button onClick={() => setActiveTab('integrations')} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Open API Intelligence</button>
              <button onClick={() => setActiveTab('env')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200">View blank environment template</button>
            </div>
          </div>
        )}

        {/* Provider portal links are reference material only; ALOAPI does not claim an OAuth grant. */}
        {activeTab === 'credentials' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-amber-500/25 bg-slate-900 p-5">
              <h2 className="text-xl font-bold text-white">Provider setup references</h2>
              <p className="mt-2 text-sm text-slate-300">Use each provider&apos;s official developer interface and consent flow. ALOAPI never asks for a provider password, OTP, or recovery code. Portal secrets are encrypted in transit with an ephemeral user-supplied passphrase and encrypted at rest; this does not establish provider access.</p>
              <button onClick={() => setActiveTab('integrations')} className="mt-4 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950">Open API Intelligence</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {PLATFORMS_CONFIG.map(platform => (
                <article key={platform.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold text-white">{platform.name}</h3><p className="mt-1 text-xs text-amber-300">Documentation link only · not connected</p></div>
                    <a href={platform.devUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-cyan-300">Official portal <ExternalLink className="h-3 w-3" /></a>
                  </div>
                  <p className="mt-4 text-[10px] uppercase tracking-wide text-slate-500">Environment names · no values stored here</p>
                  <ul className="mt-2 flex flex-wrap gap-2">{platform.fields.map(field => <li key={field.key} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-300">{field.key}{field.secret ? ' · secret' : ''}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'otp' && (
          <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white"><Smartphone className="h-5 w-5 text-cyan-400" />Provider-owned MFA &amp; setup guidance</h2>
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-100">ALOAPI does not intercept SMS, email, authenticator codes, or provider verification prompts. No OTP feed or token handshake is available here.</div>
            <p className="text-sm leading-relaxed text-slate-300">Complete any verification directly in the provider&apos;s official application or website. Never share an OTP, password, or recovery code with an agent or paste it into this dashboard. For ALOAPI administrator MFA, use the Security tab.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setActiveTab('integrations')} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Open official API setup checklist</button>
              <button onClick={() => setActiveTab('security')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200">Configure ALOAPI MFA</button>
            </div>
          </div>
        )}

        {activeTab === 'rotation' && (
          <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white"><Lock className="h-5 w-5 text-cyan-400" />Provider account security</h2>
            <p className="text-sm leading-relaxed text-slate-300">ALOAPI cannot change or verify passwords on social or advertising accounts. Change credentials only on the provider&apos;s official site. OAuth token validity after a password change varies by provider, grant, and policy; review/revoke access in that provider&apos;s official security settings.</p>
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">No password-rotation compliance state is fabricated or recorded here. ALOAPI shows only its own admin MFA/session state under Security.</p>
            <div className="flex flex-wrap gap-3"><button onClick={() => setActiveTab('security')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200">Open ALOAPI Security</button><button onClick={() => setActiveTab('integrations')} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Review provider documentation</button></div>
          </div>
        )}

        {activeTab === 'env' && (
          <div className="space-y-5">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 md:flex-row md:items-center">
              <div><h2 className="text-xl font-bold text-white">Blank environment template</h2><p className="mt-1 text-sm text-slate-400">This export has empty placeholders only. It never includes browser state, credentials, or provider tokens.</p></div>
              <button onClick={downloadEnvFile} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"><Download className="h-4 w-4" />Download blank template</button>
            </div>
            <pre className="max-h-[600px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-5 text-xs leading-relaxed text-cyan-200">{generateEnvString()}</pre>
          </div>
        )}

        </>
        )}

      </main>

    </div>
  );
}
