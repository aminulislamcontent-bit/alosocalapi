// ─── Content & SEO drafting — RULE-BASED TEMPLATES ──────────────────
// The z-ai-web-dev-sdk is present but no `.z-ai-config` exists in this
// project, so nothing here claims to be AI-generated. Output origin is
// always recorded as "rule_template" (honesty rule §15).

export type Platform = 'facebook' | 'instagram' | 'youtube' | 'linkedin' | 'tiktok' | 'x';

export interface ContentDraft {
  draft: string;
  hashtags: string[];
  origin: 'rule_template';
  platform: Platform;
}

const HOOKS: Record<Platform, { bn: string[]; en: string[] }> = {
  facebook: {
    bn: ['আপনার কি জানা দরকার ছিল?', 'আজকের বিষয় সবার আগে জানুন:', 'ছোট পরিবর্তন, বড় ফলাফল —'],
    en: ['Here is what most businesses miss:', 'A quick tip you can apply today:', 'Small change, big results —'],
  },
  instagram: {
    bn: ['সেভ করে রাখুন এই টিপ!', '৩টি ধাপ, ফলাফল স্পষ্ট।', 'আজ চেষ্টা করুন 👇'],
    en: ['Save this tip!', '3 steps, clear results.', 'Try it today 👇'],
  },
  youtube: {
    bn: ['এই ভিডিওতে দেখবেন:', 'সম্পূর্ণ গাইড — শুরু থেকে শেষ।', 'বিস্তারিত ব্যাখ্যা সহ:'],
    en: ['In this video:', 'The complete guide, start to finish.', 'Full walkthrough:'],
  },
  linkedin: {
    bn: ['ইন্ডাস্ট্রি অবজারভেশন:', 'আমাদের অভিজ্ঞতায়,', 'ডেটা যা বলছে:'],
    en: ['Industry observation:', 'In our experience,', 'What the data shows:'],
  },
  tiktok: {
    bn: ['১৫ সেকেন্ডে দেখুন!', 'এক লাইনে পুরো সূত্র:', 'এভাবেই করলে কাজ হয়:'],
    en: ['Watch in 15 seconds!', 'The whole formula in one line:', 'Here is what works:'],
  },
  x: {
    bn: ['এক লাইনে:', 'মূল কথা:', 'জানা দরকার:'],
    en: ['In one line:', 'The gist:', 'Worth knowing:'],
  },
};

const CTAS: Record<Platform, { bn: string; en: string }> = {
  facebook: { bn: 'বিস্তারিত জানতে ইনবক্স করুন।', en: 'Message us for details.' },
  instagram: { bn: 'সেভ + শেয়ার করুন!', en: 'Save and share!' },
  youtube: { bn: 'সাবস্ক্রাইব করে পাশে থাকুন।', en: 'Subscribe to stay updated.' },
  linkedin: { bn: 'আপনার অভিজ্ঞতা কমেন্টে জানান।', en: 'Share your experience in the comments.' },
  tiktok: { bn: 'ফলো করে আরও টিপ পান।', en: 'Follow for more tips.' },
  x: { bn: 'রিপোস্ট করে ছড়িয়ে দিন।', en: 'Repost if useful.' },
};

export function generateContentDraft(opts: {
  business: string;
  platform: Platform;
  topic: string;
  lang: 'bn' | 'en';
}): ContentDraft {
  const hooks = HOOKS[opts.platform][opts.lang];
  const hook = hooks[Math.floor(Math.random() * hooks.length)];
  const cta = CTAS[opts.platform][opts.lang];
  const topicWords = opts.topic.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF\s]/g, '').split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  const businessTag = opts.business.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const hashtags = [
    ...topicWords.map(w => `#${w}`),
    `#${businessTag || 'business'}`,
    opts.platform === 'instagram' || opts.platform === 'tiktok' ? '#tips' : '',
  ].filter(Boolean);

  const draft =
    `${hook}\n\n` +
    (opts.lang === 'bn'
      ? `${opts.topic} — এই বিষয়ে আপনার ${opts.business}-এর অভিজ্ঞতা ও সত্যিকারের উদাহরণ দিয়ে লিখুন। টেমপ্লেট মেসেজ নয়: নির্দিষ্ট সংখ্যা, কেস বা ছবি যোগ করুন।\n\n`
      : `${opts.topic} — write this with your own ${opts.business} experience and a real example. Not a generic message: add a specific number, case or photo.\n\n`) +
    `${cta}`;

  return { draft, hashtags, origin: 'rule_template', platform: opts.platform };
}

// ─── SEO recommendations from REAL Lighthouse data (no fabrication) ──

export interface SeoRecommendation {
  area: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
  evidence: string;
}

const AUDIT_MAP: Record<string, (a: { title?: string; displayValue?: string }) => SeoRecommendation> = {
  'meta-description': a => ({
    area: 'Meta description',
    severity: 'high',
    recommendation: 'প্রতি গুরুত্বপূর্ণ পেজে ইউনিক ১৫০-১৬০ ক্যারেক্টারের মেটা ডেসক্রিপশন যোগ করুন — টার্গেট কীওয়ার্ড সহ।',
    evidence: `Lighthouse audit "meta-description" — ${a.title ?? ''} ${a.displayValue ?? ''}`.trim(),
  }),
  'document-title': a => ({
    area: 'Page title',
    severity: 'high',
    recommendation: 'প্রতিটি পেজে ইউনিক, বর্ণনামূলক <title> দিন (মূল কীওয়ার্ড প্রথমে)।',
    evidence: `Lighthouse audit "document-title" — ${a.title ?? ''} ${a.displayValue ?? ''}`.trim(),
  }),
  'render-blocking-resources': a => ({
    area: 'Render-blocking resources',
    severity: 'medium',
    recommendation: 'ক্রিটিক্যাল CSS inline করুন এবং নন-ক্রিটিক্যাল স্ক্রিপ্টে defer/async ব্যবহার করুন।',
    evidence: `Lighthouse audit — ${a.displayValue ?? a.title ?? ''}`,
  }),
  'uses-responsive-images': a => ({
    area: 'Responsive images',
    severity: 'medium',
    recommendation: 'srcset ও WebP ব্যবহার করে ডিভাইস-অনুযায়ী ইমেজ সার্ভ করুন।',
    evidence: `Lighthouse audit — ${a.displayValue ?? a.title ?? ''}`,
  }),
  'largest-contentful-paint': a => ({
    area: 'LCP',
    severity: 'high',
    recommendation: 'LCP এলিমেন্টের লোড দ্রুত করুন: হিরো ইমেজ preload, CDN, কমপ্রেশন।',
    evidence: `Lighthouse metric — ${a.displayValue ?? ''}`,
  }),
  'cumulative-layout-shift': a => ({
    area: 'CLS',
    severity: 'medium',
    recommendation: 'ইমেজে width/height দিন, ডাইনামিক কনটেন্টে reserved space রাখুন।',
    evidence: `Lighthouse metric — ${a.displayValue ?? ''}`,
  }),
  'first-contentful-paint': a => ({
    area: 'FCP',
    severity: 'medium',
    recommendation: 'ফন্ট-লোড অপটিমাইজ করুন ও সার্ভার রেসপন্স টাইম কমান।',
    evidence: `Lighthouse metric — ${a.displayValue ?? ''}`,
  }),
};

export function generateSeoRecommendations(
  audits?: Record<string, { score?: number | null; title?: string; displayValue?: string }>,
): SeoRecommendation[] {
  if (!audits) return [];
  const out: SeoRecommendation[] = [];
  for (const [key, fn] of Object.entries(AUDIT_MAP)) {
    const audit = audits[key];
    if (!audit) continue;
    const isMetric = key.includes('paint') || key.includes('shift');
    const failing = isMetric
      ? typeof audit.score === 'number' && audit.score < 0.9
      : typeof audit.score === 'number' && audit.score < 1;
    if (failing) out.push(fn(audit));
  }
  return out;
}
