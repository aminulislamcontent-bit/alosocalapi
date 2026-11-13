import React, { useState, useEffect } from 'react';
import { 
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
  Check, 
  Eye, 
  EyeOff, 
  Zap, 
  Layers, 
  ChevronRight, 
  Server, 
  Activity, 
  Clock, 
  Trash2, 
  Plus, 
  Sparkles,
  HelpCircle,
  ArrowRight
} from 'lucide-react';

// Platform Config Metadata
const PLATFORMS_CONFIG = [
  {
    id: 'meta',
    name: 'Meta (Facebook & Instagram)',
    icon: 'fa-brands fa-facebook',
    color: 'from-blue-600 to-indigo-600',
    badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    devUrl: 'https://developers.facebook.com/apps/',
    envPrefix: 'META',
    fields: [
      { key: 'META_APP_ID', label: 'App ID', placeholder: '123456789012345', secret: false },
      { key: 'META_APP_SECRET', label: 'App Secret', placeholder: 'a1b2c3d4e5f67890', secret: true },
      { key: 'META_REDIRECT_URI', label: 'Redirect URI', placeholder: 'https://bdtech360.com/api/auth/callback/meta', secret: false },
      { key: 'META_PAGE_ID', label: 'Page ID', placeholder: '9876543210', secret: false },
      { key: 'META_PAGE_ACCESS_TOKEN', label: 'Page Access Token', placeholder: 'EAAB...', secret: true },
      { key: 'INSTAGRAM_BUSINESS_ACCOUNT_ID', label: 'Instagram Business ID', placeholder: '178414000000', secret: false }
    ]
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'fa-brands fa-linkedin',
    color: 'from-sky-600 to-blue-700',
    badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    devUrl: 'https://www.linkedin.com/developers/apps',
    envPrefix: 'LINKEDIN',
    fields: [
      { key: 'LINKEDIN_CLIENT_ID', label: 'Client ID', placeholder: '77abc123def456', secret: false },
      { key: 'LINKEDIN_CLIENT_SECRET', label: 'Client Secret', placeholder: 'WXYZ_secret_9988', secret: true },
      { key: 'LINKEDIN_ORGANIZATION_ID', label: 'Organization ID', placeholder: '1337420', secret: false },
      { key: 'LINKEDIN_ACCESS_TOKEN', label: 'OAuth Access Token', placeholder: 'AQV...', secret: true }
    ]
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    icon: 'fa-brands fa-x-twitter',
    color: 'from-zinc-700 to-zinc-900',
    badgeBg: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
    devUrl: 'https://developer.twitter.com/en/portal/dashboard',
    envPrefix: 'X',
    fields: [
      { key: 'X_CLIENT_ID', label: 'Client ID', placeholder: 'Vk9...1011', secret: false },
      { key: 'X_CLIENT_SECRET', label: 'Client Secret', placeholder: 'secret_key_x_88', secret: true },
      { key: 'X_API_KEY', label: 'API Key (Consumer Key)', placeholder: 'x_api_key_123', secret: false },
      { key: 'X_API_SECRET', label: 'API Secret', placeholder: 'x_api_secret_456', secret: true },
      { key: 'X_ACCESS_TOKEN', label: 'Access Token', placeholder: '12345-token', secret: true },
      { key: 'X_ACCESS_TOKEN_SECRET', label: 'Access Token Secret', placeholder: 'token_secret_789', secret: true }
    ]
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'fa-brands fa-tiktok',
    color: 'from-pink-600 to-rose-700',
    badgeBg: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    devUrl: 'https://developers.tiktok.com/',
    envPrefix: 'TIKTOK',
    fields: [
      { key: 'TIKTOK_CLIENT_KEY', label: 'Client Key', placeholder: 'aw123456789', secret: false },
      { key: 'TIKTOK_CLIENT_SECRET', label: 'Client Secret', placeholder: 'tt_secret_998877', secret: true },
      { key: 'TIKTOK_OPEN_ID', label: 'Open ID', placeholder: 'open_id_user_99', secret: false },
      { key: 'TIKTOK_ACCESS_TOKEN', label: 'User Access Token', placeholder: 'act.tiktok...', secret: true }
    ]
  },
  {
    id: 'youtube',
    name: 'YouTube (Google Cloud)',
    icon: 'fa-brands fa-youtube',
    color: 'from-red-600 to-rose-800',
    badgeBg: 'bg-red-500/10 text-red-400 border-red-500/20',
    devUrl: 'https://console.cloud.google.com/apis/credentials',
    envPrefix: 'YOUTUBE',
    fields: [
      { key: 'YOUTUBE_CLIENT_ID', label: 'OAuth 2.0 Client ID', placeholder: '123456-abc.apps.googleusercontent.com', secret: false },
      { key: 'YOUTUBE_CLIENT_SECRET', label: 'Client Secret', placeholder: 'GOCSPX-secret123', secret: true },
      { key: 'YOUTUBE_CHANNEL_ID', label: 'Channel ID', placeholder: 'UC1234567890', secret: false },
      { key: 'YOUTUBE_ACCESS_TOKEN', label: 'OAuth Access Token', placeholder: 'ya29.a0...', secret: true }
    ]
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    icon: 'fa-brands fa-pinterest',
    color: 'from-red-500 to-red-700',
    badgeBg: 'bg-red-500/10 text-red-400 border-red-500/20',
    devUrl: 'https://developers.pinterest.com/apps/',
    envPrefix: 'PINTEREST',
    fields: [
      { key: 'PINTEREST_APP_ID', label: 'App ID', placeholder: '1499882', secret: false },
      { key: 'PINTEREST_APP_SECRET', label: 'App Secret', placeholder: 'p_secret_key_88', secret: true }
    ]
  }
];

// Initial State Mock Data
const INITIAL_ENV_VALUES = {
  META_APP_ID: '109827364512398',
  META_APP_SECRET: '8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c',
  META_REDIRECT_URI: 'https://bdtech360.com/api/auth/callback/meta',
  META_PAGE_ID: '10293847561',
  META_PAGE_ACCESS_TOKEN: '',
  INSTAGRAM_BUSINESS_ACCOUNT_ID: '178414099887766',
  
  LINKEDIN_CLIENT_ID: '77acb987654321',
  LINKEDIN_CLIENT_SECRET: 'LKIN_sec_998877665544',
  LINKEDIN_ORGANIZATION_ID: '1337420',
  LINKEDIN_ACCESS_TOKEN: '',

  X_CLIENT_ID: 'Vk9XYZ1011121314',
  X_CLIENT_SECRET: 'x_sec_key_00998877665544',
  X_API_KEY: 'x_api_key_8899',
  X_API_SECRET: 'x_api_secret_7766',
  X_ACCESS_TOKEN: '',
  X_ACCESS_TOKEN_SECRET: '',

  TIKTOK_CLIENT_KEY: 'aw99887766554433',
  TIKTOK_CLIENT_SECRET: 'tt_sec_88776655443322',
  TIKTOK_OPEN_ID: '',
  TIKTOK_ACCESS_TOKEN: '',

  YOUTUBE_CLIENT_ID: '987654321098-apps.googleusercontent.com',
  YOUTUBE_CLIENT_SECRET: 'GOCSPX-secret_token_tech360',
  YOUTUBE_CHANNEL_ID: 'UC360TechBDOfficial',
  YOUTUBE_ACCESS_TOKEN: '',

  PINTEREST_APP_ID: '1499882',
  PINTEREST_APP_SECRET: 'p_secret_998877'
};

const INITIAL_TOKENS = [
  {
    id: 'tok-1',
    platform: 'Meta (Facebook & Instagram)',
    platformId: 'meta',
    type: 'Long-Lived User Access Token',
    token: 'EAAG9ZCZC1...987AABBCC',
    expiresIn: '59 Days (Long-Lived)',
    status: 'ACTIVE',
    issuedAt: '2026-10-25 14:30:12',
    scope: 'pages_show_list, instagram_basic, instagram_content_publish'
  },
  {
    id: 'tok-2',
    platform: 'LinkedIn',
    platformId: 'linkedin',
    type: 'OAuth 2.0 Access Token',
    token: 'AQV876...XYZ9911',
    expiresIn: '60 Days',
    status: 'ACTIVE',
    issuedAt: '2026-10-26 09:15:00',
    scope: 'w_member_social, r_organization_social, rw_organization_admin'
  }
];

const INITIAL_OTP_FEED = [
  {
    id: 'otp-101',
    platform: 'Meta (Facebook)',
    code: '849201',
    channel: 'SMS (httpSMS Gateway)',
    sender: '+8801700000000',
    timestamp: 'Just now',
    verified: false,
    details: 'Security verification code for OAuth handshake request from BDTECH360 engine.'
  },
  {
    id: 'otp-102',
    platform: 'Google / YouTube',
    code: '392104',
    channel: 'SMTP Email (Admin Relay)',
    sender: 'security-noreply@google.com',
    timestamp: '4 mins ago',
    verified: true,
    details: 'Google Cloud Console OAuth 2.0 device verification request code.'
  }
];

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('wizard'); // 'wizard', 'credentials', 'otp', 'rotation', 'env'

  // Application State
  const [envValues, setEnvValues] = useState(INITIAL_ENV_VALUES);
  const [showSecrets, setShowSecrets] = useState({});
  const [tokens, setTokens] = useState(INITIAL_TOKENS);
  const [otpFeed, setOtpFeed] = useState(INITIAL_OTP_FEED);
  
  // Gateways State
  const [gateways, setGateways] = useState({
    portalOtp: true,
    httpSms: true,
    smtpHost: true
  });

  // Verification & Password Audit States
  const [passwordAudit, setPasswordAudit] = useState({
    meta: { rotated: true, lastRotated: '2026-10-26 11:20 AM', admin: 'Super Admin' },
    linkedin: { rotated: false, lastRotated: 'Never', admin: '-' },
    x: { rotated: false, lastRotated: 'Never', admin: '-' },
    tiktok: { rotated: false, lastRotated: 'Never', admin: '-' },
    youtube: { rotated: true, lastRotated: '2026-10-25 04:45 PM', admin: 'Staff Ops Admin' },
    pinterest: { rotated: false, lastRotated: 'Never', admin: '-' }
  });

  // Modals & UI Controls
  const [selectedPlatformForOtp, setSelectedPlatformForOtp] = useState('meta');
  const [inputOtpCode, setInputOtpCode] = useState('');
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Helper for Toasts
  const showToast = (msg, type = 'success') => {
    setToastMessage({ msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Toggle Secret Field Visibility
  const toggleSecret = (key) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Handle Input Change for Environment Variables
  const handleEnvChange = (key, val) => {
    setEnvValues(prev => ({ ...prev, [key]: val }));
  };

  // Copy helper
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  };

  // Generate Master .env string
  const generateEnvString = () => {
    let result = `# ====================================================\n`;
    result += `# TECH360 - OAuth & Credential Vault Configuration\n`;
    result += `# Generated: ${new Date().toLocaleString()}\n`;
    result += `# ====================================================\n\n`;

    PLATFORMS_CONFIG.forEach(plat => {
      result += `# --- ${plat.name} ---\n`;
      plat.fields.forEach(f => {
        result += `${f.key}=${envValues[f.key] || ''}\n`;
      });
      result += `\n`;
    });

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

    const newOtp = {
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

      const newToken = {
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

      setTokens([newToken, ...tokens]);

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
  const togglePasswordRotation = (platId) => {
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
                <ShieldCheck className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">TECH360</h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  v2.4 Security Vault
                </span>
              </div>
              <p className="text-xs text-slate-400">OAuth & Credential Security Manager</p>
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
          </div>

        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-medium border-t border-slate-800/60 pt-3">
          <button
            onClick={() => setActiveTab('wizard')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'wizard'
                ? 'bg-slate-800 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            3-Step Workflow Guide
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
            Step 2: OTP & 2FA Interceptor
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
                  <strong className="text-cyan-300">Note:</strong> Modern OAuth 2.0 implementations allow access tokens and long-lived refresh tokens to remain valid even after you change your account password, ensuring your platform's automated integrations keep running smoothly while your underlying accounts remain completely secure.
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

        {/* TAB 1: WORKFLOW WIZARD GUIDE */}
        {activeTab === 'wizard' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  3-Step Automation & Authentication Lifecycle
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
                    App Connection & Authorization
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
                      Secure App ID & Secret state management
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
                    Handling OTP & 2FA Verification
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
                      Real-time webhook & SMS OTP interceptor
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
                  Step 1: OAuth App Vault & Developer Dashboards
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
                      <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${platform.color} flex items-center justify-center text-white text-lg shadow-md`}>
                        <i className={platform.icon}></i>
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
                  Step 2: Live Gateway OTP & 2FA Interceptor
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
                    onChange={(e) => setInputOtpCode(e.target.value)}
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
                        Verify OTP & Issue Access Token
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
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
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
                              VERIFIED & EXCHANGED
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setInputOtpCode(item.code);
                                executeTokenHandshake(item.code);
                              }}
                              className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-semibold transition-all flex items-center gap-1"
                            >
                              Auto-Fill & Exchange
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
                  Step 3: Post-Collection Password Rotation & Token Vault
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
                                Rotated & Secured
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
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300/90 overflow-x-auto leading-relaxed selection:bg-cyan-500 selection:text-slate-950 max-h-[500px] overflow-y-auto">
                {generateEnvString()}
              </pre>
            </div>
          </div>
        )}

      </main>

    </div>
  );
}