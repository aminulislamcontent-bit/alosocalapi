// Provider metadata only. This module is bundled into the browser, so it must
// never contain credential values, OTPs, recovery codes, or simulated statuses.
export interface PlatformField {
  key: string;
  label: string;
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

export const PLATFORMS_CONFIG: PlatformConfig[] = [
  {
    id: 'meta', name: 'Meta (Facebook & Instagram)', icon: 'facebook',
    color: 'from-blue-600 to-indigo-600', badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    devUrl: 'https://developers.facebook.com/apps/', envPrefix: 'META',
    fields: [
      { key: 'META_APP_ID', label: 'App ID', secret: false },
      { key: 'META_APP_SECRET', label: 'App Secret', secret: true },
      { key: 'META_REDIRECT_URI', label: 'Redirect URI', secret: false },
      { key: 'META_PAGE_ID', label: 'Page ID', secret: false },
      { key: 'META_PAGE_ACCESS_TOKEN', label: 'Page Access Token', secret: true },
      { key: 'INSTAGRAM_BUSINESS_ACCOUNT_ID', label: 'Instagram Professional Account ID', secret: false },
    ],
  },
  {
    id: 'linkedin', name: 'LinkedIn', icon: 'linkedin',
    color: 'from-sky-600 to-blue-700', badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    devUrl: 'https://www.linkedin.com/developers/apps', envPrefix: 'LINKEDIN',
    fields: [
      { key: 'LINKEDIN_CLIENT_ID', label: 'Client ID', secret: false },
      { key: 'LINKEDIN_CLIENT_SECRET', label: 'Client Secret', secret: true },
      { key: 'LINKEDIN_ORGANIZATION_ID', label: 'Organization ID', secret: false },
      { key: 'LINKEDIN_ACCESS_TOKEN', label: 'OAuth Access Token', secret: true },
    ],
  },
  {
    id: 'x', name: 'X API', icon: 'x',
    color: 'from-zinc-700 to-zinc-900', badgeBg: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
    devUrl: 'https://developer.x.com/en/portal/dashboard', envPrefix: 'X',
    fields: [
      { key: 'X_CLIENT_ID', label: 'Client ID', secret: false },
      { key: 'X_CLIENT_SECRET', label: 'Client Secret', secret: true },
      { key: 'X_API_KEY', label: 'API Key', secret: true },
      { key: 'X_API_SECRET', label: 'API Secret', secret: true },
      { key: 'X_ACCESS_TOKEN', label: 'Access Token', secret: true },
      { key: 'X_ACCESS_TOKEN_SECRET', label: 'Access Token Secret', secret: true },
    ],
  },
  {
    id: 'tiktok', name: 'TikTok', icon: 'tiktok',
    color: 'from-pink-600 to-rose-700', badgeBg: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    devUrl: 'https://developers.tiktok.com/', envPrefix: 'TIKTOK',
    fields: [
      { key: 'TIKTOK_CLIENT_KEY', label: 'Client Key', secret: false },
      { key: 'TIKTOK_CLIENT_SECRET', label: 'Client Secret', secret: true },
      { key: 'TIKTOK_OPEN_ID', label: 'Open ID', secret: false },
      { key: 'TIKTOK_ACCESS_TOKEN', label: 'User Access Token', secret: true },
    ],
  },
  {
    id: 'youtube', name: 'YouTube / Google Cloud', icon: 'youtube',
    color: 'from-red-600 to-rose-800', badgeBg: 'bg-red-500/10 text-red-400 border-red-500/20',
    devUrl: 'https://console.cloud.google.com/apis/credentials', envPrefix: 'YOUTUBE',
    fields: [
      { key: 'YOUTUBE_CLIENT_ID', label: 'OAuth Client ID', secret: false },
      { key: 'YOUTUBE_CLIENT_SECRET', label: 'Client Secret', secret: true },
      { key: 'YOUTUBE_CHANNEL_ID', label: 'Channel ID', secret: false },
      { key: 'YOUTUBE_ACCESS_TOKEN', label: 'OAuth Access Token', secret: true },
    ],
  },
  {
    id: 'pinterest', name: 'Pinterest', icon: 'pinterest',
    color: 'from-red-500 to-red-700', badgeBg: 'bg-red-500/10 text-red-400 border-red-500/20',
    devUrl: 'https://developers.pinterest.com/apps/', envPrefix: 'PINTEREST',
    fields: [
      { key: 'PINTEREST_APP_ID', label: 'App ID', secret: false },
      { key: 'PINTEREST_APP_SECRET', label: 'App Secret', secret: true },
    ],
  },
];

// Compile-time-only view types; no sample token instances are provided.
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

export interface PasswordAuditEntry {
  rotated: boolean;
  lastRotated: string;
  admin: string;
}
