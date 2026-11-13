import type { SbCategory } from './types';

// 📊 CATEGORY 7: CRM, MARKETING & ANALYTICS — 7 platforms
export const CAT_CRM: SbCategory = {
  key: 'crm',
  emoji: '📊',
  name: 'CRM, Marketing & Analytics',
  bn: 'সিআরএম ও মার্কেটিং',
  desc: 'HubSpot, Mailchimp, Pixel-সহ ৭টি টুল',
  grad: 'from-fuchsia-500 to-purple-700',
  platforms: [
    {
      key: 'hubspot', name: 'HubSpot', bn: 'হাবস্পট', icon: '🧲', grad: 'from-orange-500 to-red-700',
      vHint: 'GET /crm/v3/objects/contacts', expiry: 'Private app token — never',
      fields: [
        { k: 'access_token', label: 'Private App Access Token', bn: 'প্রাইভেট অ্যাপ টোকেন', desc: 'pat- দিয়ে শুরু হয়।', steps: ['HubSpot → Settings → Integrations → Private apps → Create'], sens: true, pat: '^pat-[a-z0-9]{2}-[a-z0-9]{2,}-[a-zA-Z0-9-]{20,}$', hint: 'pat-na1-xxxx এই ফরম্যাটে' },
        { k: 'portal_id', label: 'Portal ID (Hub ID)', bn: 'পোর্টাল আইডি', desc: 'আপনার HubSpot হাব নম্বর।', steps: ['লগইন করা অবস্থায় URL বা Settings এ দেখুন'] },
      ],
    },
    {
      key: 'mailchimp', name: 'Mailchimp', bn: 'মেইলচিম্প', icon: '🐒', grad: 'from-yellow-400 to-amber-700',
      vHint: 'GET /3.0/lists',
      fields: [
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'কি-র শেষে সার্ভার প্রিফিক্স থাকে।', steps: ['mailchimp.com → Profile → Extras → API keys'], sens: true, pat: '^[a-f0-9]{32}-us[0-9]{1,2}$', hint: 'ফরম্যাট: xxxxxxxx-us21' },
        { k: 'server_prefix', label: 'Server Prefix', bn: 'সার্ভার প্রিফিক্স', desc: 'কি-র শেষাংশ, যেমন us21।', steps: ['API কি-র শেষ অংশ থেকে'] },
        { k: 'audience_id', label: 'Audience / List ID', bn: 'অডিয়েন্স আইডি', desc: 'যে লিস্টে সাবস্ক্রাইবার থাকে।', steps: ['Audience → Settings → Audience ID'] },
      ],
    },
    {
      key: 'meta_pixel', name: 'Meta Pixel / CAPI', bn: 'মেটা পিক্সেল', icon: 'pixel', grad: 'from-blue-500 to-indigo-700',
      vHint: 'POST /v19.0/{pixel-id}/events (test)',
      fields: [
        { k: 'pixel_id', label: 'Pixel ID', bn: 'পিক্সেল আইডি', desc: 'Events Manager পিক্সেল আইডি।', steps: ['events.facebook.com → Pixel সিলেক্ট'], pat: '^\\d{15,16}$', hint: '১৫-১৬ সংখ্যার আইডি' },
        { k: 'capi_token', label: 'Conversions API Token', bn: 'কনভার্সন টোকেন', desc: 'সার্ভার-সাইড ইভেন্ট পাঠানোর টোকেন।', steps: ['Events Manager → Settings → Conversions API → Generate'], sens: true },
        { k: 'test_event_code', label: 'Test Event Code (optional)', bn: 'টেস্ট ইভেন্ট কোড', desc: 'টেস্ট ইভেন্ট দেখতে চাইলে।', steps: ['Test events ট্যাব থেকে'] },
      ],
    },
    {
      key: 'tiktok_pixel', name: 'TikTok Pixel', bn: 'টিকটক পিক্সেল', icon: 'tiktok', grad: 'from-neutral-600 to-black',
      vHint: 'POST /open_api/v1.3/pixel/track/',
      fields: [
        { k: 'pixel_code', label: 'Pixel Code / ID', bn: 'পিক্সেল কোড', desc: 'TikTok পিক্সেল আইডি।', steps: ['ads.tiktok.com → Assets → Events → Web events'] },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'Events API টোকেন।', steps: ['একই পেজে Generate'], sens: true },
        { k: 'advertiser_id', label: 'Advertiser ID', bn: 'অ্যাডভারটাইজার আইডি', desc: 'TikTok Ads অ্যাকাউন্ট আইডি।', steps: ['অ্যাকাউন্ট সেটিংসে'] },
      ],
    },
    {
      key: 'hotjar', name: 'Hotjar', bn: 'হটজার', icon: '🔥', grad: 'from-red-500 to-pink-700',
      vHint: 'GET /insights/v1/sites/{id}',
      fields: [
        { k: 'site_id', label: 'Site ID', bn: 'সাইট আইডি', desc: 'Hotjar সাইট নম্বর।', steps: ['insights.hotjar.com → Sites → আইডি'] },
        { k: 'api_token', label: 'API Token', bn: 'এপিআই টোকেন', desc: 'Insights API টোকেন।', steps: ['Settings → Integrations → API'], sens: true },
      ],
    },
    {
      key: 'mixpanel', name: 'Mixpanel', bn: 'মিক্সপ্যানেল', icon: '📈', grad: 'from-purple-500 to-fuchsia-700',
      vHint: 'GET /api/2.0/engage',
      fields: [
        { k: 'project_token', label: 'Project Token', bn: 'প্রজেক্ট টোকেন', desc: 'ইভেন্ট পাঠানোর টোকেন।', steps: ['Settings → Project settings → Access keys'] },
        { k: 'api_secret', label: 'API Secret', bn: 'এপিআই সিক্রেট', desc: 'পুরনো কুয়েরি API-র সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'service_username', label: 'Service Account User', bn: 'সার্ভিস ইউজার', desc: 'Service account ইউজারনেম।', steps: ['Organization settings → Service accounts'] },
        { k: 'service_secret', label: 'Service Account Secret', bn: 'সার্ভিস সিক্রেট', desc: 'Service account সিক্রেট।', steps: ['একই পেজে'], sens: true },
      ],
    },
    {
      key: 'zapier', name: 'Zapier', bn: 'জ্যাপিয়ার', icon: '⚡', grad: 'from-orange-400 to-red-600',
      vHint: 'POST to webhook URL with test payload',
      fields: [
        { k: 'api_key', label: 'API Key (Partner)', bn: 'এপিআই কি', desc: 'Partner API কি থাকলে।', steps: ['developer.zapier.com → অ্যাপ কি'], sens: true },
        { k: 'webhook_url', label: 'Catch Hook URL', bn: 'ওয়েবহুক লিংক', desc: 'Webhooks by Zapier ট্রিগার লিংক।', steps: ['Zapier → Webhooks by Zapier → Catch hook → লিংক কপি'] },
      ],
    },
  ],
};
