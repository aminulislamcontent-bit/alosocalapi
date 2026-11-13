// TECH360 - OAuth & Credential Vault: Platform metadata & initial state data

export interface PlatformField {
  key: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export interface PlatformConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  badgeBg: string;
  devUrl: string;
  envPrefix: string;
  fields: PlatformField[];
}

// Platform Config Metadata
export const PLATFORMS_CONFIG: PlatformConfig[] = [
  {
    id: 'meta',
    name: 'Meta (Facebook & Instagram)',
    icon: 'facebook',
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
    icon: 'linkedin',
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
    icon: 'x',
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
    icon: 'tiktok',
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
    icon: 'youtube',
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
    icon: 'pinterest',
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
export const INITIAL_ENV_VALUES: Record<string, string> = {
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

export interface VaultToken {
  id: string;
  platform: string;
  platformId: string;
  type: string;
  token: string;
  expiresIn: string;
  status: string;
  issuedAt: string;
  scope: string;
}

export const INITIAL_TOKENS: VaultToken[] = [
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

export interface OtpFeedItem {
  id: string;
  platform: string;
  code: string;
  channel: string;
  sender: string;
  timestamp: string;
  verified: boolean;
  details: string;
}

export const INITIAL_OTP_FEED: OtpFeedItem[] = [
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

export interface PasswordAuditEntry {
  rotated: boolean;
  lastRotated: string;
  admin: string;
}

export const INITIAL_PASSWORD_AUDIT: Record<string, PasswordAuditEntry> = {
  meta: { rotated: true, lastRotated: '2026-10-26 11:20 AM', admin: 'Super Admin' },
  linkedin: { rotated: false, lastRotated: 'Never', admin: '-' },
  x: { rotated: false, lastRotated: 'Never', admin: '-' },
  tiktok: { rotated: false, lastRotated: 'Never', admin: '-' },
  youtube: { rotated: true, lastRotated: '2026-10-25 04:45 PM', admin: 'Staff Ops Admin' },
  pinterest: { rotated: false, lastRotated: 'Never', admin: '-' }
};
