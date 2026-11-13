// Al-Amin IP Access - Marketing Channel Matrix & Launch Planner data
// Source: client-provided marketing operations table (Bangladesh market focused)

export type ChannelGroup = 'meta' | 'google' | 'social' | 'paid' | 'retention' | 'foundation';
export type LeadTier = 'foundation' | 'core' | 'growth' | 'test';

export interface CreativeSize {
  label: string;
  note?: string;
}

export interface TimeWindow {
  window: string;
  note?: string;
}

export interface MarketingChannel {
  id: string;
  name: string;
  group: ChannelGroup;
  leadTier: LeadTier;
  funnel: string[];
  assets: string[];
  sizes: CreativeSize[];
  bestTimes: TimeWindow[];
  bestDays?: string[];
  avoid?: string[];
  useCase?: string;
  setupUrl?: string;
  setupLabel?: string;
  envKeys?: string[];
  priority: number; // lower = build sooner (drives Next Best Actions)
}

export interface ChannelStatusEntry {
  live: boolean;
  handle: string;
}

export type ChannelStatusMap = Record<string, ChannelStatusEntry>;
export type AccessIdMap = Record<string, string[]>;

export interface CompanyProfile {
  name: string;
  niche: string;
  audience: string;
  budget: string;
}

export const GROUP_META: Record<ChannelGroup, { label: string; badge: string }> = {
  meta: { label: 'Meta Ecosystem', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  google: { label: 'Google Network', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  social: { label: 'Social & Content', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  paid: { label: 'Paid Networks', badge: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20' },
  retention: { label: 'Retention & Direct', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  foundation: { label: 'Foundation', badge: 'bg-slate-500/10 text-slate-300 border-slate-500/20' }
};

export const TIER_META: Record<LeadTier, { label: string; badge: string; desc: string }> = {
  foundation: { label: 'Build First', badge: 'bg-slate-500/10 text-slate-300 border-slate-400/30', desc: 'Everything else depends on this' },
  core: { label: 'Core Lead Gen', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', desc: 'Highest lead & sales impact' },
  growth: { label: 'Growth Engine', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', desc: 'Scales reach & compounds leads' },
  test: { label: 'Test Channel', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', desc: 'Experiment after core is stable' }
};

export const CHANNELS: MarketingChannel[] = [
  {
    id: 'website-seo',
    name: 'Website + SEO',
    group: 'foundation',
    leadTier: 'foundation',
    funnel: ['Conversion'],
    assets: ['Fast, mobile-optimized website', 'Clear CTA on every page', 'SEO blog + landing pages', 'Pixel & tracking setup'],
    sizes: [],
    bestTimes: [],
    useCase: 'The 24/7 lead collector. Every ad, post and bio link should land here. Build this before anything else.',
    setupUrl: 'https://hpanel.hostinger.com/',
    setupLabel: 'Open Hosting Panel',
    priority: 0
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    group: 'foundation',
    leadTier: 'foundation',
    funnel: ['Retention'],
    assets: ['Website traffic reports', 'Audience behaviour flow', 'Conversion tracking', 'Data & decision making'],
    sizes: [],
    bestTimes: [],
    useCase: 'Install before spending on ads — you cannot optimize what you cannot measure.',
    setupUrl: 'https://analytics.google.com/',
    setupLabel: 'Open Google Analytics',
    priority: 1
  },
  {
    id: 'facebook',
    name: 'Facebook',
    group: 'meta',
    leadTier: 'core',
    funnel: ['Awareness', 'Consideration', 'Conversion'],
    assets: ['Page', 'Group', 'Facebook Reels', 'Marketplace', 'Facebook Ads', 'Facebook Stories'],
    sizes: [
      { label: 'Feed image 1080 × 1350 px', note: '4:5 ratio — সবচেয়ে পারফর্ম করে' },
      { label: 'Square 1080 × 1080 px' },
      { label: 'Horizontal 1200 × 628 px' },
      { label: 'Story / Reels 1080 × 1920 px' }
    ],
    bestTimes: [
      { window: '12 PM – 2 PM', note: 'Lunch break → highest scroll time' },
      { window: '5 PM – 7 PM', note: 'Office শেষ → free time' },
      { window: '8 PM – 10 PM', note: 'Peak engagement' }
    ],
    avoid: ['Morning 6–10 AM (Low CTR)', 'Midnight (except entertainment niche)'],
    setupUrl: 'https://www.facebook.com/pages/create',
    setupLabel: 'Create Facebook Page',
    envKeys: ['META_PAGE_ID', 'META_PAGE_ACCESS_TOKEN'],
    priority: 2
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    group: 'meta',
    leadTier: 'core',
    funnel: ['Conversion', 'Retention'],
    assets: ['WhatsApp Business profile', 'Broadcast list', 'Product catalog', 'Quick replies'],
    sizes: [],
    bestTimes: [],
    useCase: 'Direct 1-to-1 sales chat — the highest reply-rate channel in Bangladesh. Close and retain leads here.',
    setupUrl: 'https://business.whatsapp.com/',
    setupLabel: 'Set up WhatsApp Business',
    priority: 3
  },
  {
    id: 'instagram',
    name: 'Instagram',
    group: 'meta',
    leadTier: 'core',
    funnel: ['Awareness', 'Consideration'],
    assets: ['Feed posts', 'Reels', 'Stories', 'Collab Posts', 'Instagram Ads', 'Highlights'],
    sizes: [
      { label: 'Feed (best performance) 1080 × 1350 px', note: '4:5' },
      { label: 'Square 1080 × 1080 px' },
      { label: 'Story 1080 × 1920 px' },
      { label: 'Reels 1080 × 1920 px' }
    ],
    bestTimes: [
      { window: '11 AM – 1 PM' },
      { window: '6 PM – 8 PM' },
      { window: '10 PM – 11 PM', note: 'Reels perform best' }
    ],
    bestDays: ['Tuesday', 'Thursday', 'Friday (highest reach)'],
    setupUrl: 'https://business.instagram.com/',
    setupLabel: 'Create Business Account',
    envKeys: ['INSTAGRAM_BUSINESS_ACCOUNT_ID'],
    priority: 4
  },
  {
    id: 'messenger',
    name: 'Messenger',
    group: 'meta',
    leadTier: 'core',
    funnel: ['Conversion', 'Retention'],
    assets: ['Automated chat', 'Broadcast', 'Custom reply'],
    sizes: [],
    bestTimes: [],
    useCase: 'Fast sales + customer retention. Automated replies capture leads 24/7 even when you sleep.',
    setupUrl: 'https://business.facebook.com/',
    setupLabel: 'Open Meta Business Suite',
    envKeys: ['META_PAGE_ID'],
    priority: 5
  },
  {
    id: 'tiktok',
    name: 'TikTok + TikTok Ads',
    group: 'social',
    leadTier: 'growth',
    funnel: ['Awareness', 'Conversion'],
    assets: ['Organic videos', 'TikTok Ads', 'Spark Ads', 'Live stream sales'],
    sizes: [
      { label: 'In-feed ads / Boost 1080 × 1920 px', note: 'Aspect ratio 9:16' }
    ],
    bestTimes: [],
    useCase: 'Organic viral reach + live stream selling. Fastest free reach for new brands.',
    setupUrl: 'https://www.tiktok.com/business/',
    setupLabel: 'Open TikTok Business',
    priority: 6
  },
  {
    id: 'youtube',
    name: 'YouTube',
    group: 'social',
    leadTier: 'growth',
    funnel: ['Awareness', 'Consideration'],
    assets: ['Long videos', 'Shorts', 'YouTube Ads', 'Live'],
    sizes: [
      { label: 'Thumbnail 1280 × 720 px', note: 'Minimum' }
    ],
    bestTimes: [
      { window: 'Shorts: 11 AM – 12 PM' },
      { window: 'Shorts: 3 PM – 6 PM' },
      { window: 'Shorts: 9 PM – 11 PM' },
      { window: 'Long videos: 12 PM – 2 PM' },
      { window: 'Long videos: 7 PM – 10 PM' }
    ],
    setupUrl: 'https://www.youtube.com/',
    setupLabel: 'Create Channel',
    envKeys: ['YOUTUBE_CHANNEL_ID'],
    priority: 7
  },
  {
    id: 'email-marketing',
    name: 'Email Marketing',
    group: 'retention',
    leadTier: 'core',
    funnel: ['Retention'],
    assets: ['Email broadcast', 'WhatsApp / SMS broadcast', 'Newsletter', 'Lead magnet funnel'],
    sizes: [],
    bestTimes: [],
    useCase: 'Own your lead list — you control the channel, no algorithm. Highest ROI for repeat sales.',
    setupUrl: 'https://mailchimp.com/',
    setupLabel: 'Open Email Tool',
    priority: 8
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    group: 'social',
    leadTier: 'growth',
    funnel: ['Consideration', 'Conversion'],
    assets: ['Company page', 'Personal branding', 'LinkedIn Ads', 'Articles'],
    sizes: [
      { label: 'Single Image Ads 1200 × 628 px' },
      { label: 'Square 1080 × 1080 px' },
      { label: 'Story 1080 × 1920 px' }
    ],
    bestTimes: [
      { window: '9 AM – 11 AM' },
      { window: '12 PM – 2 PM' }
    ],
    bestDays: ['Tuesday, Wednesday, Thursday → highest business engagement'],
    avoid: ['Weekends', 'Night-time'],
    useCase: 'B2B leads, partnerships and founder authority via personal branding.',
    setupUrl: 'https://www.linkedin.com/company/setup/new/',
    setupLabel: 'Create Company Page',
    envKeys: ['LINKEDIN_ORGANIZATION_ID'],
    priority: 9
  },
  {
    id: 'google-maps',
    name: 'Google Maps Ads',
    group: 'google',
    leadTier: 'core',
    funnel: ['Conversion'],
    assets: ['Local search ads', 'Business profile promotion', 'Store visit campaigns'],
    sizes: [],
    bestTimes: [],
    useCase: 'Local customers find, call and navigate to you. Essential for local service businesses.',
    setupUrl: 'https://business.google.com/',
    setupLabel: 'Open Google Business Profile',
    priority: 10
  },
  {
    id: 'gdn',
    name: 'Google Display Network',
    group: 'google',
    leadTier: 'growth',
    funnel: ['Awareness'],
    assets: ['Websites + Apps placement', 'Brand awareness banners', 'Remarketing display'],
    sizes: [
      { label: '300 × 250 px' },
      { label: '336 × 280 px' },
      { label: '728 × 90 px' },
      { label: '300 × 600 px' },
      { label: '320 × 50 px', note: 'Mobile banner' }
    ],
    bestTimes: [],
    useCase: 'Massive visual reach across millions of websites and apps for brand awareness.',
    setupUrl: 'https://ads.google.com/',
    setupLabel: 'Open Google Ads',
    priority: 11
  },
  {
    id: 'youtube-ads',
    name: 'YouTube Ads',
    group: 'google',
    leadTier: 'growth',
    funnel: ['Awareness', 'Consideration'],
    assets: ['Skippable in-stream ads', 'Shorts ads', 'Bumper ads'],
    sizes: [
      { label: 'In-stream 1920 × 1080 px' },
      { label: 'Shorts ad 1080 × 1920 px' }
    ],
    bestTimes: [],
    useCase: 'Video marketing with the strongest hook format — ideal for product demos and offers.',
    setupUrl: 'https://ads.google.com/',
    setupLabel: 'Open Google Ads',
    priority: 12
  },
  {
    id: 'google-shopping',
    name: 'Google Shopping Ads',
    group: 'google',
    leadTier: 'growth',
    funnel: ['Conversion'],
    assets: ['Product listings', 'Merchant Center feed', 'Shopping campaigns'],
    sizes: [
      { label: 'Product image 1000 × 1000 px', note: 'Recommended' }
    ],
    bestTimes: [],
    useCase: 'Best for products — buyers already searching with purchase intent.',
    setupUrl: 'https://merchants.google.com/',
    setupLabel: 'Open Merchant Center',
    priority: 13
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    group: 'social',
    leadTier: 'test',
    funnel: ['Awareness', 'Consideration'],
    assets: ['Pin', 'Board', 'Pinterest Ads'],
    sizes: [
      { label: 'Pin 1000 × 1500 px', note: '2:3 ratio' }
    ],
    bestTimes: [
      { window: '8 PM – 11 PM', note: 'General evening browsing' }
    ],
    useCase: 'Evergreen visual discovery traffic — pins keep bringing leads for months.',
    setupUrl: 'https://business.pinterest.com/',
    setupLabel: 'Open Pinterest Business',
    priority: 14
  },
  {
    id: 'x',
    name: 'Twitter (X)',
    group: 'social',
    leadTier: 'test',
    funnel: ['Awareness'],
    assets: ['Content', 'Community', 'Twitter Ads'],
    sizes: [
      { label: 'Single image 1600 × 900 px' },
      { label: 'Square 1080 × 1080 px' }
    ],
    bestTimes: [],
    useCase: 'Real-time conversation, tech audience and brand voice building.',
    setupUrl: 'https://ads.twitter.com/',
    setupLabel: 'Open X Ads',
    priority: 15
  },
  {
    id: 'reddit',
    name: 'Reddit',
    group: 'social',
    leadTier: 'test',
    funnel: ['Consideration'],
    assets: ['Community marketing', 'Reddit Ads'],
    sizes: [],
    bestTimes: [],
    useCase: 'Community trust-building — answer questions where your buyers hang out.',
    setupUrl: 'https://ads.reddit.com/',
    setupLabel: 'Open Reddit Ads',
    priority: 16
  },
  {
    id: 'telegram',
    name: 'Telegram',
    group: 'retention',
    leadTier: 'test',
    funnel: ['Retention'],
    assets: ['Channel', 'Group'],
    sizes: [],
    bestTimes: [],
    useCase: 'Tech + Education niche communities — broadcast updates to your most loyal followers.',
    setupUrl: 'https://telegram.org/',
    setupLabel: 'Create Channel',
    priority: 17
  },
  {
    id: 'snapchat',
    name: 'Snapchat Ads',
    group: 'paid',
    leadTier: 'test',
    funnel: ['Awareness'],
    assets: ['Snap ads', 'Story ads', 'Collection ads'],
    sizes: [
      { label: 'Full screen 1080 × 1920 px', note: '9:16' }
    ],
    bestTimes: [],
    useCase: 'Young audience targeting (13–24) with full-screen vertical video.',
    setupUrl: 'https://ads.snapchat.com/',
    setupLabel: 'Open Snapchat Ads',
    priority: 18
  },
  {
    id: 'quora',
    name: 'Quora Ads',
    group: 'paid',
    leadTier: 'test',
    funnel: ['Consideration'],
    assets: ['Question-based targeting', 'Promoted answers'],
    sizes: [],
    bestTimes: [],
    useCase: 'Reach people actively asking questions about your niche — high intent readers.',
    setupUrl: 'https://www.quora.com/advertising',
    setupLabel: 'Open Quora Ads',
    priority: 19
  },
  {
    id: 'google-discovery',
    name: 'Google Discovery Ads',
    group: 'google',
    leadTier: 'test',
    funnel: ['Awareness'],
    assets: ['Discover feed', 'Gmail promotions', 'YouTube home feed'],
    sizes: [
      { label: 'Landscape 1200 × 628 px' },
      { label: 'Portrait 1080 × 1920 px' }
    ],
    bestTimes: [],
    useCase: 'Visual reach across Discover + Gmail + YouTube feeds.',
    setupUrl: 'https://ads.google.com/',
    setupLabel: 'Open Google Ads',
    priority: 20
  }
];

export interface LaunchStep {
  channelId: string;
  title: string;
  why: string;
}

export interface LaunchPhase {
  id: string;
  name: string;
  tagline: string;
  steps: LaunchStep[];
}

export const LAUNCH_PHASES: LaunchPhase[] = [
  {
    id: 'phase-0',
    name: 'Phase 0 — Foundation',
    tagline: 'No site yet? Perfect. Build the lead-collecting base first — everything else points here.',
    steps: [
      {
        channelId: 'website-seo',
        title: 'Build the website + landing pages',
        why: 'Your 24/7 lead collector. Fast, mobile-first, one clear CTA, pixel installed before any traffic.'
      },
      {
        channelId: 'google-analytics',
        title: 'Install Google Analytics + conversion tracking',
        why: 'Track traffic, behaviour and conversions from day one so every taka is accountable.'
      }
    ]
  },
  {
    id: 'phase-1',
    name: 'Phase 1 — Lead Core',
    tagline: 'The 4 channels that collect leads and close sales fastest in Bangladesh.',
    steps: [
      {
        channelId: 'facebook',
        title: 'Create the Facebook Page + start posting',
        why: 'Biggest local audience. Page + group + boosted posts = fastest lead flow.'
      },
      {
        channelId: 'whatsapp',
        title: 'Set up WhatsApp Business',
        why: 'Highest reply-rate sales channel. Add catalog + quick replies and put the link everywhere.'
      },
      {
        channelId: 'instagram',
        title: 'Create Instagram Business account',
        why: 'Visual trust + Reels reach for younger buyers. Cross-post Facebook content.'
      },
      {
        channelId: 'messenger',
        title: 'Turn on Messenger auto-replies',
        why: 'Automated chat captures and qualifies leads 24/7 from your Page.'
      }
    ]
  },
  {
    id: 'phase-2',
    name: 'Phase 2 — Content Engines',
    tagline: 'Free organic reach that compounds over time.',
    steps: [
      {
        channelId: 'tiktok',
        title: 'Launch TikTok organic + live selling',
        why: 'Fastest organic reach for new brands; live streams convert directly.'
      },
      {
        channelId: 'youtube',
        title: 'Start YouTube Shorts + long videos',
        why: 'Search-friendly content keeps bringing leads months later.'
      },
      {
        channelId: 'linkedin',
        title: 'Create LinkedIn company page + founder profile',
        why: 'B2B leads and authority through personal branding and articles.'
      }
    ]
  },
  {
    id: 'phase-3',
    name: 'Phase 3 — Paid Amplification',
    tagline: 'Only after foundation + core are live: put money behind what already works.',
    steps: [
      {
        channelId: 'facebook',
        title: 'Run Meta Ads (boost + lead campaigns)',
        why: 'Amplify your best organic posts and lead forms to cold audiences.'
      },
      {
        channelId: 'tiktok',
        title: 'Spark Ads on winning organic videos',
        why: 'Promote proven content — cheapest CPM for reach among young buyers.'
      },
      {
        channelId: 'youtube-ads',
        title: 'Launch YouTube video ads',
        why: 'Hook-based video ads to retarget website visitors and warm audiences.'
      },
      {
        channelId: 'gdn',
        title: 'Display remarketing across web & apps',
        why: 'Stay visible to everyone who visited but did not convert.'
      }
    ]
  },
  {
    id: 'phase-4',
    name: 'Phase 4 — Retention & Scale',
    tagline: 'Turn one-time buyers into repeat revenue.',
    steps: [
      {
        channelId: 'email-marketing',
        title: 'Build the email / SMS broadcast list',
        why: 'Offer broadcasts and newsletters to your collected leads — repeat sales on demand.'
      },
      {
        channelId: 'whatsapp',
        title: 'WhatsApp broadcast lists for offers',
        why: 'Direct offers to warm buyers — open rates far above email.'
      },
      {
        channelId: 'messenger',
        title: 'Messenger custom reply flows',
        why: 'Personalized follow-up sequences that recover abandoned leads.'
      },
      {
        channelId: 'telegram',
        title: 'Open a Telegram channel (tech/education)',
        why: 'Loyal community hub for updates, drops and education content.'
      }
    ]
  }
];

export function getChannel(id: string): MarketingChannel | undefined {
  return CHANNELS.find(c => c.id === id);
}
