// SetupBot Pro v2.0 — type definitions for the 10-category / 75+ platform
// onboarding agent. Fields are compact (k/bn/desc/steps) so the whole library
// stays navigable; every client-visible string is Bengali-first.

export interface SbField {
  k: string; // field key (used as CredentialEntry.fieldKey)
  label: string; // English technical label
  bn: string; // Bengali label
  desc: string; // one-line Bengali description (why it's needed)
  steps: string[]; // 1-3 short Bengali how-to steps
  ph?: string; // placeholder
  sens?: boolean; // sensitive → masked input + encrypted export
  pat?: string; // regex source for format validation
  hint?: string; // Bengali format hint shown on wrong format
  help?: string; // official help URL
  area?: boolean; // render as textarea (JSON keys, multi-line)
  expiry?: string; // token-expiry note for this specific credential
}

export interface SbPlatform {
  key: string; // unique platform key (CredentialEntry.platform)
  name: string; // English name
  bn: string; // Bengali name
  icon: string; // PlatformIcon key or fallback emoji chip
  grad: string; // tailwind gradient classes
  fields: SbField[];
  vHint?: string; // health-check endpoint note (from spec "Validate:")
  expiry?: string; // token expiry note for health table
}

export interface SbCategory {
  key: string; // category key used in export buckets
  emoji: string;
  name: string; // English
  bn: string; // Bengali menu label
  desc: string; // one-line Bengali description
  grad: string;
  platforms: SbPlatform[];
}

export const SB_VERSION = '2.0';

/** Buckets used in the master export JSON (spec Phase 4) */
export const EXPORT_BUCKETS: Record<string, string> = {
  ecommerce: 'ecommerce',
  social: 'social',
  video: 'video',
  seo: 'seo',
  payment: 'payment',
  logistics: 'logistics',
  crm: 'crm',
  content: 'content',
  webhook: 'webhook',
};

/** Static token-refresh schedule shown in export + health table */
export const TOKEN_REFRESH_SCHEDULE: Record<string, string> = {
  facebook_page_token: 'every_60_days',
  youtube_oauth: 'auto_via_refresh_token',
  google_oauth: 'auto_via_refresh_token',
  twitter_oauth2: 'every_2_hours',
  tiktok: 'every_24_hours',
};
