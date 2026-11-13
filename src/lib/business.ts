// ─────────────────────────────────────────────────────────────
// ALO Education BD — business identity (single source of truth)
// Used across UI branding, invite templates, exports & automation
// ─────────────────────────────────────────────────────────────

export const BUSINESS = {
  name: 'ALO Education BD',
  nameBn: 'এলও এডুকেশন বিডি',
  tagline: 'শিক্ষা • অটোমেশন • গ্রোথ — এক প্ল্যাটফর্মে',
  website: 'https://aloeducation.bd',
  domains: ['aloeducation.bd', 'alo.education'],
  youtube: 'https://www.youtube.com/@aloeducationbd',
  youtubeHandle: '@aloeducationbd',
  socialHandle: 'aloeducation',
  facebookPage: 'https://www.facebook.com/ALOLearningJourney',
  facebookHandle: 'ALOLearningJourney',
  phone: '+880 1805-020101',
  phoneRaw: '+8801805020101',
  whatsappNumber: '+880 1805-020103',
  whatsappNumberRaw: '+8801805020103',
  email: 'info@aloeducation.com',
} as const;

/** Supported lead sources with Bangla labels */
export const LEAD_SOURCES: { key: string; label: string }[] = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'referral', label: 'রেফারেল' },
  { key: 'walk_in', label: 'সরাসরি ভিজিট' },
  { key: 'phone', label: 'ফোন কল' },
  { key: 'manual', label: 'অন্যান্য' },
];

export function sourceLabel(key: string): string {
  return LEAD_SOURCES.find(s => s.key === key)?.label ?? key;
}

/** Admission pipeline stages with Bangla labels + colors */
export const STAGES: { key: string; label: string; color: string; bg: string; order: number }[] = [
  { key: 'new', label: 'নতুন লিড', color: 'text-slate-300', bg: 'bg-slate-700/40 border-slate-600', order: 0 },
  { key: 'contacted', label: 'যোগাযোগ হয়েছে', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/30', order: 1 },
  { key: 'demo', label: 'ডেমো ক্লাস', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/30', order: 2 },
  { key: 'negotiated', label: 'ফি আলোচনা', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/30', order: 3 },
  { key: 'enrolled', label: 'ভর্তি সম্পন্ন', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30', order: 4 },
  { key: 'lost', label: 'হারিয়ে গেছে', color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/30', order: 5 },
];

export function stageMeta(key: string) {
  return STAGES.find(s => s.key === key) ?? STAGES[0];
}

/** WhatsApp invite template for sharing portal credentials with clients/staff */
export function buildInviteMessage(name: string, username: string, password: string, portalUrl: string): string {
  return [
    `সম্মানিত ${name},`,
    '',
    `${BUSINESS.name}-এর নিরাপদ তথ্য-সংগ্রহ পোর্টালে আপনার অ্যাকাউন্ট তৈরি হয়েছে।`,
    '',
    `🔗 লিংক: ${portalUrl}`,
    `👤 ইউজারনেম: ${username}`,
    `🔑 সাময়িক পাসওয়ার্ড: ${password}`,
    '',
    'লগইন করে ধাপে ধাপে (বাংলা গাইড অনুযায়ী) প্রয়োজনীয় সব তথ্য দিন।',
    'সংগ্রহ শেষ হলে অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে লক হয়ে যাবে — পাসওয়ার্ড পরিবর্তনে চিন্তা নেই।',
    '',
    `— ${BUSINESS.name}`,
    BUSINESS.phone,
  ].join('\n');
}
