'use client';

import React, { useState } from 'react';
import {
  Radar,
  LayoutGrid,
  Target,
  Rocket,
  ShieldCheck,
  Key,
  Lock,
  RefreshCw,
  Copy,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Mail,
  Radio,
  FileText,
  Eye,
  EyeOff,
  Zap,
  Layers,
  ChevronRight,
  Activity,
  Sparkles,
  ArrowRight,
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
import {
  PLATFORMS_CONFIG,
  INITIAL_ENV_VALUES,
  INITIAL_TOKENS,
  INITIAL_OTP_FEED,
  INITIAL_PASSWORD_AUDIT,
  type VaultToken,
  type OtpFeedItem,
  type PasswordAuditEntry
} from '@/lib/vault-data';
import { BrandIcon } from '@/components/brand-icons';
import DashboardTab from '@/components/dashboard-tab';
import ChannelsTab from '@/components/channels-tab';
import PlannerTab from '@/components/planner-tab';
import { usePersistentState } from '@/lib/usePersistentState';
import { CHANNELS, LAUNCH_PHASES, type CompanyProfile, type ChannelStatusMap, type AccessIdMap } from '@/lib/channels-data';

type TabId = 'access' | 'crm' | 'tasks' | 'automation' | 'setupbot' | 'engine' | 'dashboard' | 'channels' | 'planner' | 'wizard' | 'credentials' | 'otp' | 'rotation' | 'env';
type GatewayKey = 'portalOtp' | 'httpSms' | 'smtpHost';

export default function AdminConsole({ onLogout }: { onLogout: () => void }) {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('access');

  // Application State
  const [envValues, setEnvValues] = useState<Record<string, string>>(INITIAL_ENV_VALUES);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [tokens, setTokens] = useState<VaultToken[]>(INITIAL_TOKENS);
  const [otpFeed, setOtpFeed] = useState<OtpFeedItem[]>(INITIAL_OTP_FEED);

  // Gateways State
  const [gateways, setGateways] = useState<Record<GatewayKey, boolean>>({
    portalOtp: true,
    httpSms: true,
    smtpHost: true
  });

  // Verification & Password Audit States
  const [passwordAudit, setPasswordAudit] = useState<Record<string, PasswordAuditEntry>>(INITIAL_PASSWORD_AUDIT);

  // Company Profile, Channel Status & XX Access IDs (persisted to localStorage)
  const [company, setCompany] = usePersistentState<CompanyProfile>('aia-company-v1', { name: '', niche: '', audience: '', budget: '' });
  const [channelStatus, setChannelStatus] = usePersistentState<ChannelStatusMap>('aia-channel-status-v1', {});
  const [accessIds, setAccessIds] = usePersistentState<AccessIdMap>('aia-access-ids-v1', {});

  // Modals & UI Controls
  const [selectedPlatformForOtp, setSelectedPlatformForOtp] = useState('meta');
  const [inputOtpCode, setInputOtpCode] = useState('');
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ msg: string; type: string } | null>(null);

  // Helper for Toasts
  const showToast = (msg: string, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Toggle Secret Field Visibility
  const toggleSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Handle Input Change for Environment Variables
  const handleEnvChange = (key: string, val: string) => {
    setEnvValues(prev => ({ ...prev, [key]: val }));
  };

  // Copy helper with graceful fallback
  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast(`Copied ${label} to clipboard!`);
    } catch {
      showToast('Clipboard copy failed - please copy manually.', 'error');
    }
  };

  // Generate Master .env string
  const generateEnvString = () => {
    let result = `# ====================================================\n`;
    result += `# AL-AMIN IP ACCESS - Marketing Ops & Access Vault Configuration\n`;
    if (company.name || company.niche) {
      result += `# Company: ${company.name || '-'} | Niche: ${company.niche || '-'}\n`;
    }
    result += `# Generated: ${new Date().toLocaleString()}\n`;
    result += `# ====================================================\n\n`;

    PLATFORMS_CONFIG.forEach(plat => {
      result += `# --- ${plat.name} ---\n`;
      plat.fields.forEach(f => {
        result += `${f.key}=${envValues[f.key] || ''}\n`;
      });
      result += `\n`;
    });

    const xxEntries = Object.entries(accessIds).flatMap(([cid, ids]) => ids.map(id => ({ cid, id })));
    if (xxEntries.length > 0) {
      result += `# --- Company XX Access IDs (pre-launch placeholders) ---\n`;
      xxEntries.forEach(e => {
        result += `${e.id} # channel: ${e.cid}\n`;
      });
      result += `\n`;
    }

    result += `# --- Gateway Status ---\n`;
    result += `PORTAL_OTP=${gateways.portalOtp}\n`;
    result += `HTTPSMS_ENABLED=${gateways.httpSms}\n`;
    result += `SMTP_HOST_ENABLED=${gateways.smtpHost}\n`;

    return result;
  };

  // Download .env file
  const downloadEnvFile = () => {
    const element = document.createElement("a");
    const file = new Blob([generateEnvString()], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = ".env.social-vault";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast("Downloaded .env.social-vault configuration file!");
  };

  // Simulate Triggering New OTP Request
  const triggerNewOtpRequest = () => {
    const platformObj = PLATFORMS_CONFIG.find(p => p.id === selectedPlatformForOtp);
    const mockCodes = ['482910', '910283', '374829', '109283', '554129'];
    const randomCode = mockCodes[Math.floor(Math.random() * mockCodes.length)];

    const newOtp: OtpFeedItem = {
      id: `otp-${Date.now()}`,
      platform: platformObj ? platformObj.name : 'Meta (Facebook)',
      code: randomCode,
      channel: gateways.httpSms ? 'SMS (httpSMS Gateway)' : 'SMTP Email (Admin Relay)',
      sender: gateways.httpSms ? '+8801711223344' : 'security@auth-relay.com',
      timestamp: 'Just now',
      verified: false,
      details: `Intercepted 2FA handshake verification code for ${platformObj?.name || 'Social Platform'}.`
    };

    setOtpFeed([newOtp, ...otpFeed]);
    setInputOtpCode(randomCode);
    showToast(`Intercepted new OTP code: ${randomCode} for ${platformObj?.name || 'Platform'}`);
  };

  // Simulate Handshake & Token Issue
  const executeTokenHandshake = (otpToVerify = inputOtpCode) => {
    if (!otpToVerify || otpToVerify.length < 4) {
      showToast('Please enter a valid verification OTP code!', 'error');
      return;
    }

    setIsHandshaking(true);

    setTimeout(() => {
      setIsHandshaking(false);
      const platObj = PLATFORMS_CONFIG.find(p => p.id === selectedPlatformForOtp);
      const randomTok = 'EAAG' + Math.random().toString(36).substring(2, 12).toUpperCase() + '...SEC360';

      const newToken: VaultToken = {
        id: `tok-${Date.now()}`,
        platform: platObj ? platObj.name : 'Social Platform',
        platformId: selectedPlatformForOtp,
        type: 'Long-Lived OAuth 2.0 Access Token',
        token: randomTok,
        expiresIn: '60 Days (Auto-Refresh Configured)',
        status: 'ACTIVE',
        issuedAt: new Date().toLocaleString(),
        scope: 'full_access, publish_content, manage_pages'
      };

      setTokens(prev => [newToken, ...prev]);

      // Update OTP feed verified status
      setOtpFeed(prev => prev.map(o => o.code === otpToVerify ? { ...o, verified: true } : o));

      // Update platform access token env field automatically
      const tokenField = platObj?.fields.find(f => f.key.includes('ACCESS_TOKEN') || f.key.includes('TOKEN'));
      if (tokenField) {
        handleEnvChange(tokenField.key, randomTok);
      }

      setInputOtpCode('');
      showToast(`Token generated & handshake verified for ${platObj?.name}!`, 'success');
    }, 1200);
  };

  // Toggle Password Rotation Audit State
  const togglePasswordRotation = (platId: string) => {
    setPasswordAudit(prev => {
      const current = prev[platId];
      const nextState = !current.rotated;
      return {
        ...prev,
        [platId]: {
          rotated: nextState,
          lastRotated: nextState ? new Date().toLocaleString() : 'Never',
          admin: nextState ? 'Current Admin User' : '-'
        }
      };
    });
    showToast(`Updated password rotation security status!`);
  };

  // Channel & Launch Planner actions
  const toggleChannelLive = (channelId: string) => {
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

  const generateXXId = (channelId: string) => {
    const prefix = channelId.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);
    const rand = (Math.random().toString(36).slice(2, 6) + Date.now().toString(36).slice(-2)).toUpperCase();
    const xxId = `XX-${prefix}-${rand}`;
    setAccessIds(prev => ({ ...prev, [channelId]: [xxId, ...(prev[channelId] ?? [])] }));
    showToast(`XX Access ID generated: ${xxId}`);
  };

  const removeXXId = (channelId: string, xxId: string) => {
    setAccessIds(prev => ({ ...prev, [channelId]: (prev[channelId] ?? []).filter(x => x !== xxId) }));
    showToast('XX Access ID removed.');
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
                  v4.0 CRM &amp; Automation
                </span>
              </div>
              <p className="text-xs text-slate-400">{BUSINESS.email} • {BUSINESS.phone}</p>
            </div>
          </div>

          {/* System Status Indicators */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300">PORTAL_OTP: <strong className="text-emerald-400">ENABLED</strong></span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-slate-300">httpSMS: <strong className="text-cyan-400 font-semibold">CONNECTED</strong></span>
            </div>
            <button
              onClick={() => setActiveTab('env')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-sans font-semibold text-xs hover:opacity-95 transition-all shadow-md shadow-cyan-500/20"
            >
              <FileText className="w-3.5 h-3.5" />
              Export .env
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
            Step 1: OAuth App Vault ({PLATFORMS_CONFIG.length})
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
            Step 2: OTP &amp; 2FA Interceptor
            {otpFeed.filter(o => !o.verified).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            )}
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
            Step 3: Password Rotation Audit
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
            Live .env Config Generator
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

        {activeTab !== 'access' && activeTab !== 'crm' && activeTab !== 'tasks' && activeTab !== 'automation' && activeTab !== 'setupbot' && activeTab !== 'engine' && (
        <>
        {/* SECURITY HIGHLIGHT BANNER */}
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-cyan-950/60 border border-cyan-500/30 shadow-xl shadow-cyan-950/20 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 translate-x-12 -translate-y-12 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0 mt-0.5 md:mt-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-cyan-400 font-semibold uppercase tracking-wider">Enterprise OAuth Standard</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">OAuth 2.0 Security Token Policy</span>
                </div>
                <p className="text-xs md:text-sm text-slate-200 mt-1 leading-relaxed">
                  <strong className="text-cyan-300">Note:</strong> Modern OAuth 2.0 implementations allow access tokens and long-lived refresh tokens to remain valid even after you change your account password, ensuring your platform&apos;s automated integrations keep running smoothly while your underlying accounts remain completely secure.
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('rotation')}
              className="shrink-0 text-xs font-semibold px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-2"
            >
              Password Rotation Audit
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* TAB 0: OPS DASHBOARD */}
        {activeTab === 'dashboard' && (
          <DashboardTab
            company={company}
            onCompanyChange={setCompany}
            channelStatus={channelStatus}
            tokens={tokens}
            passwordAudit={passwordAudit}
            onGoTo={(tab) => setActiveTab(tab)}
          />
        )}

        {/* TAB 0b: MARKETING CHANNEL MATRIX */}
        {activeTab === 'channels' && (
          <ChannelsTab
            channelStatus={channelStatus}
            onToggleLive={toggleChannelLive}
            onSetHandle={setChannelHandle}
            onCopy={copyToClipboard}
          />
        )}

        {/* TAB 0c: NEW COMPANY LAUNCH PLANNER */}
        {activeTab === 'planner' && (
          <PlannerTab
            channelStatus={channelStatus}
            accessIds={accessIds}
            onToggleLive={toggleChannelLive}
            onGenerateXX={generateXXId}
            onRemoveXX={removeXXId}
            onCopy={copyToClipboard}
            onOpenVault={() => setActiveTab('credentials')}
          />
        )}

        {/* TAB 1: WORKFLOW WIZARD GUIDE */}
        {activeTab === 'wizard' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  3-Step Automation &amp; Authentication Lifecycle
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Follow the structured roadmap to link platform developer applications, intercept 2FA verification, and rotate account credentials securely.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('credentials')}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                Start Step 1 Now
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Step Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Step 1 Card */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all space-y-4 flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold font-mono">
                      01
                    </span>
                    <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-800 text-slate-400">OAuth Vault</span>
                  </div>

                  <h3 className="text-base font-bold text-white mt-4 group-hover:text-blue-400 transition-colors">
                    App Connection &amp; Authorization
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Log into developer portals for Meta, LinkedIn, X, TikTok, YouTube, and Pinterest to acquire Client IDs and Secrets.
                  </p>

                  <ul className="mt-4 space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      Direct links to 6 Developer Dashboards
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      Secure App ID &amp; Secret state management
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      Live .env configuration mapping
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => setActiveTab('credentials')}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-blue-600/20 text-blue-300 text-xs font-semibold border border-blue-500/30 transition-all flex items-center justify-center gap-2"
                >
                  Configure Platform Keys
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Step 2 Card */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4 flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-xs font-bold font-mono">
                      02
                    </span>
                    <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-800 text-slate-400">Gateway Stream</span>
                  </div>

                  <h3 className="text-base font-bold text-white mt-4 group-hover:text-cyan-400 transition-colors">
                    Handling OTP &amp; 2FA Verification
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Intercept verification SMS/Emails via httpSMS or SMTP Relay during automated handshake authorization.
                  </p>

                  <ul className="mt-4 space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      `PORTAL_OTP=true` Live status monitoring
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      Real-time webhook &amp; SMS OTP interceptor
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      Automated Long-Lived token exchange
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => setActiveTab('otp')}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-cyan-600/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30 transition-all flex items-center justify-center gap-2"
                >
                  Open OTP Command Center
                  <Radio className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Step 3 Card */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-4 flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs font-bold font-mono">
                      03
                    </span>
                    <span className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-800 text-slate-400">Security Audit</span>
                  </div>

                  <h3 className="text-base font-bold text-white mt-4 group-hover:text-emerald-400 transition-colors">
                    Rotating Passwords Post-Collection
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    Immediately change account passwords once long-lived OAuth tokens are secured into the vault.
                  </p>

                  <ul className="mt-4 space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      Password change compliance auditor
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      OAuth Token Vault expiration tracking
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      Zero-downtime background tokens
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => setActiveTab('rotation')}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition-all flex items-center justify-center gap-2"
                >
                  Review Password Audit
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

            {/* Quick Actions Panel */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-6">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Ready to deploy to production?
                </h4>
                <p className="text-xs text-slate-400">
                  You can copy your populated .env values anytime and paste directly into Hostinger hPanel or Vercel.
                </p>
              </div>
              <div className="flex items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={downloadEnvFile}
                  className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download .env File
                </button>
                <button
                  onClick={() => copyToClipboard(generateEnvString(), '.env master file')}
                  className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-500/20"
                >
                  <Copy className="w-4 h-4" />
                  Copy .env Raw Text
                </button>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: STEP 1 - OAUTH APP VAULT */}
        {activeTab === 'credentials' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-cyan-400" />
                  Step 1: OAuth App Vault &amp; Developer Dashboards
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage app keys for all 6 social network developer portals. Changes update the live `.env` exporter automatically.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                  Configured: <strong className="text-cyan-400">6 / 6 Platforms</strong>
                </span>
              </div>
            </div>

            {/* Platform Credentials Accordion / Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {PLATFORMS_CONFIG.map(platform => (
                <div
                  key={platform.id}
                  className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-4 relative overflow-hidden"
                >
                  {/* Top Bar with Icon & Dev Link */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${platform.color} flex items-center justify-center text-white shadow-md`}>
                        <BrandIcon id={platform.icon} className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">{platform.name}</h3>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${platform.badgeBg}`}>
                          {platform.envPrefix}_* Variables
                        </span>
                      </div>
                    </div>

                    <a
                      href={platform.devUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium border border-cyan-500/20 transition-all flex items-center gap-1.5"
                    >
                      Developer Portal
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Input Fields Grid */}
                  <div className="space-y-3">
                    {platform.fields.map(field => (
                      <div key={field.key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-mono text-slate-300 font-medium">{field.label}</label>
                          <span className="font-mono text-[10px] text-slate-500">{field.key}</span>
                        </div>
                        <div className="relative">
                          <input
                            type={field.secret && !showSecrets[field.key] ? "password" : "text"}
                            value={envValues[field.key] || ''}
                            onChange={(e) => handleEnvChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-all pr-10"
                          />
                          {field.secret && (
                            <button
                              type="button"
                              onClick={() => toggleSecret(field.key)}
                              className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
                              aria-label={`Toggle visibility of ${field.label}`}
                            >
                              {showSecrets[field.key] ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Connection Test & Token Actions */}
                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Handshake Ready
                    </span>
                    <button
                      onClick={() => {
                        setSelectedPlatformForOtp(platform.id);
                        setActiveTab('otp');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition-all flex items-center gap-1"
                    >
                      Trigger OTP Intercept
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: STEP 2 - OTP & 2FA INTERCEPTOR STREAM */}
        {activeTab === 'otp' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-cyan-400" />
                  Step 2: Live Gateway OTP &amp; 2FA Interceptor
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Intercept incoming 2FA verification codes during automated account authentication and token exchange handshakes.
                </p>
              </div>

              {/* Gateway Toggle Controls */}
              <div className="flex items-center gap-3 bg-slate-900 p-1.5 rounded-xl border border-slate-800 text-xs font-mono">
                <button
                  onClick={() => setGateways(g => ({ ...g, portalOtp: !g.portalOtp }))}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    gateways.portalOtp ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  PORTAL_OTP
                </button>
                <button
                  onClick={() => setGateways(g => ({ ...g, httpSms: !g.httpSms }))}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    gateways.httpSms ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  httpSMS
                </button>
                <button
                  onClick={() => setGateways(g => ({ ...g, smtpHost: !g.smtpHost }))}
                  className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                    gateways.smtpHost ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-500'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  SMTP Relay
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left Column: Interactive OTP Input & Token Issuer */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 h-fit">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    Token Handshake Verifier
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Live Session
                  </span>
                </div>

                {/* Target Platform Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Target Social Platform</label>
                  <select
                    value={selectedPlatformForOtp}
                    onChange={(e) => setSelectedPlatformForOtp(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50"
                  >
                    {PLATFORMS_CONFIG.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* OTP Code Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <label className="text-slate-400">Enter Intercepted OTP</label>
                    <span className="text-slate-500">6-Digit Numerical</span>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    value={inputOtpCode}
                    onChange={(e) => setInputOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="e.g. 849201"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-lg text-center font-mono font-bold tracking-widest text-cyan-400 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                {/* Simulation Action Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={() => executeTokenHandshake()}
                    disabled={isHandshaking}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                  >
                    {isHandshaking ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Exchanging Token with OAuth Server...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Verify OTP &amp; Issue Access Token
                      </>
                    )}
                  </button>

                  <button
                    onClick={triggerNewOtpRequest}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    Simulate Inbound 2FA SMS Code
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
                  <p>
                    ⚡ Handshakes intercept 2FA prompts and exchange them automatically for long-lived access tokens without revealing platform master passwords.
                  </p>
                </div>
              </div>

              {/* Right Column: Live Intercepted Webhook Stream */}
              <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-white">Live Intercepted OTP Stream</h3>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Showing {otpFeed.length} feed entries
                  </span>
                </div>

                {/* OTP Log Stream Cards */}
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                  {otpFeed.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border transition-all ${
                        item.verified
                          ? 'bg-slate-950/40 border-slate-800/60 opacity-70'
                          : 'bg-slate-950 border-cyan-500/30 shadow-md shadow-cyan-950/20'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${item.verified ? 'bg-slate-600' : 'bg-cyan-400 animate-ping'}`}></span>
                          <span className="text-xs font-bold text-white">{item.platform}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {item.channel}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-slate-500">{item.timestamp}</span>
                          {item.verified ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-semibold border border-emerald-500/20">
                              VERIFIED &amp; EXCHANGED
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setInputOtpCode(item.code);
                                executeTokenHandshake(item.code);
                              }}
                              className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-semibold transition-all flex items-center gap-1"
                            >
                              Auto-Fill &amp; Exchange
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                        <div>
                          <p className="text-[11px] text-slate-400 font-mono">{item.details}</p>
                          <span className="text-[10px] text-slate-500 font-mono">From Sender: {item.sender}</span>
                        </div>
                        <div className="text-right pl-4">
                          <span className="text-xs text-slate-400 font-mono block text-[10px]">OTP CODE</span>
                          <span className="text-lg font-mono font-bold text-cyan-400 tracking-wider">
                            {item.code}
                          </span>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>

              </div>

            </div>
          </div>
        )}

        {/* TAB 4: STEP 3 - PASSWORD ROTATION AUDIT & TOKEN VAULT */}
        {activeTab === 'rotation' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-cyan-400" />
                  Step 3: Post-Collection Password Rotation &amp; Token Vault
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Acquired long-lived tokens remain active even after password rotation. Audit and secure your social master accounts.
                </p>
              </div>
            </div>

            {/* Issued Token Vault View */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Active Acquired OAuth Access Tokens</h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {tokens.length} Active Vault Tokens
                </span>
              </div>

              <div className="space-y-3">
                {tokens.map(tok => (
                  <div key={tok.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{tok.platform}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {tok.type}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-cyan-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-800 inline-block">
                        {tok.token}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span>Expires: <strong className="text-slate-200">{tok.expiresIn}</strong></span>
                        <span>•</span>
                        <span>Issued: <strong className="text-slate-200">{tok.issuedAt}</strong></span>
                      </div>
                    </div>

                    <button
                      onClick={() => copyToClipboard(tok.token, `${tok.platform} Token`)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy Token
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* One-Click Password Rotation Checklist Table */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-cyan-400" />
                  Master Account Password Change Compliance Auditor
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  Rotation Compliance Status
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 font-mono text-slate-400">
                      <th className="py-3 px-4">Social Platform</th>
                      <th className="py-3 px-4">OAuth Token Status</th>
                      <th className="py-3 px-4">Password Rotated</th>
                      <th className="py-3 px-4">Last Rotation Date</th>
                      <th className="py-3 px-4">Audited By</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {PLATFORMS_CONFIG.map(p => {
                      const audit = passwordAudit[p.id];
                      if (!audit) return null;
                      return (
                        <tr key={p.id} className="hover:bg-slate-950/40 transition-colors">
                          <td className="py-3.5 px-4 font-sans font-medium text-white">
                            {p.name}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Active Token
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {audit.rotated ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                                Rotated &amp; Secured
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20">
                                Rotation Pending
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400">
                            {audit.lastRotated}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400">
                            {audit.admin}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => togglePasswordRotation(p.id)}
                              className={`px-3 py-1 rounded-lg text-xs font-sans font-semibold transition-all ${
                                audit.rotated
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                              }`}
                            >
                              {audit.rotated ? 'Mark Unrotated' : 'Mark Password Changed'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 5: LIVE .ENV MASTER CONFIG GENERATOR */}
        {activeTab === 'env' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  Step 4: Live Master .env Configuration Exporter
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Real-time generated environment variables formatted for Hostinger hPanel, Vercel, or local `.env` files.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => copyToClipboard(generateEnvString(), '.env text')}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-2"
                >
                  <Copy className="w-4 h-4 text-cyan-400" />
                  Copy Text
                </button>
                <button
                  onClick={downloadEnvFile}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
                >
                  <Download className="w-4 h-4" />
                  Download .env.social-vault
                </button>
              </div>
            </div>

            {/* Code Block Container */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-slate-800">
                <span>File: .env.social-vault</span>
                <span className="text-cyan-400">Live Auto-Updating</span>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300/90 overflow-x-auto leading-relaxed selection:bg-cyan-500 selection:text-slate-950 max-h-[500px] overflow-y-auto custom-scrollbar">
                {generateEnvString()}
              </pre>
            </div>
          </div>
        )}

        </>
        )}

      </main>

    </div>
  );
}
