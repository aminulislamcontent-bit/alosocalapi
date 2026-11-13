import type { SbCategory } from './types';

// 🔍 CATEGORY 4: SEO & SEARCH — 10 platforms
export const CAT_SEO: SbCategory = {
  key: 'seo',
  emoji: '🔍',
  name: 'SEO & Search',
  bn: 'এসইও ও সার্চ',
  desc: 'Search Console, GA4, Google Ads-সহ ১০টি টুল',
  grad: 'from-teal-500 to-emerald-700',
  platforms: [
    {
      key: 'gsc', name: 'Google Search Console', bn: 'গুগল সার্চ কনসোল', icon: '🔎', grad: 'from-blue-500 to-teal-600',
      vHint: 'GET /webmasters/v3/sites', expiry: 'Refresh token — auto',
      fields: [
        { k: 'property_url', label: 'Property URL', bn: 'প্রপার্টি লিংক', desc: 'ভেরিফাই করা সাইটের লিংক।', steps: ['search.google.com/search-console → প্রপার্টি সিলেক্ট'], ph: 'https://example.com/' },
        { k: 'service_account_json', label: 'Service Account JSON', bn: 'সার্ভিস অ্যাকাউন্ট JSON', desc: 'সার্ভার থেকে রিপোর্ট আনার কি ফাইল।', steps: ['console.cloud.google.com → IAM → Service accounts → Keys → JSON'], sens: true, area: true },
        { k: 'oauth_refresh', label: 'OAuth Refresh Token', bn: 'রিফ্রেশ টোকেন', desc: 'webmasters.readonly স্কোপ টোকেন।', steps: ['OAuth Playground দিয়ে জেনারেট'], sens: true },
      ],
    },
    {
      key: 'ga4', name: 'Google Analytics 4', bn: 'গুগল অ্যানালিটিক্স ৪', icon: 'google_analytics', grad: 'from-amber-500 to-orange-700',
      vHint: 'GET /analyticsdata/v1beta/properties/{id}:runReport',
      fields: [
        { k: 'measurement_id', label: 'Measurement ID', bn: 'মেজারমেন্ট আইডি', desc: 'ওয়েবসাইট ট্র্যাকিং আইডি।', steps: ['GA4 → Admin → Data streams → আইডি দেখুন'], pat: '^G-[A-Z0-9]{6,12}$', hint: 'G- দিয়ে শুরু হয়, যেমন: G-ABC1234567' },
        { k: 'api_secret', label: 'API Secret (MP)', bn: 'এপিআই সিক্রেট', desc: 'Measurement Protocol ইভেন্ট পাঠাতে।', steps: ['Admin → Data streams → Stream → API secrets'], sens: true },
        { k: 'property_id', label: 'Property ID', bn: 'প্রপার্টি আইডি', desc: 'রিপোর্ট আনার প্রপার্টি নম্বর।', steps: ['Admin → Property settings'], pat: '^\\d{6,12}$', hint: 'শুধু সংখ্যা, যেমন: 123456789' },
        { k: 'service_account_json', label: 'Service Account JSON', bn: 'সার্ভিস অ্যাকাউন্ট JSON', desc: 'সার্ভার রিপোর্টিংয়ের কি ফাইল।', steps: ['GSC-এর মতো একই প্রজেক্ট ব্যবহার করতে পারেন'], sens: true, area: true },
      ],
    },
    {
      key: 'gtm', name: 'Google Tag Manager', bn: 'গুগল ট্যাগ ম্যানেজার', icon: '🏷️', grad: 'from-blue-500 to-cyan-700',
      vHint: 'GET /tagmanager/v2/accounts/{id}',
      fields: [
        { k: 'container_id', label: 'Container ID', bn: 'কনটেইনার আইডি', desc: 'GTM-XXXXXXX আইডি।', steps: ['tagmanager.google.com → কনটেইনার সিলেক্ট'], pat: '^GTM-[A-Z0-9]{5,10}$', hint: 'GTM- দিয়ে শুরু হয়' },
        { k: 'account_id', label: 'Account ID', bn: 'অ্যাকাউন্ট আইডি', desc: 'GTM অ্যাকাউন্ট নম্বর।', steps: ['URL বা Admin থেকে দেখুন'] },
        { k: 'service_account_json', label: 'Service Account JSON', bn: 'সার্ভিস অ্যাকাউন্ট JSON', desc: 'API অ্যাক্সেস কি ফাইল।', steps: ['Cloud console → Service account keys'], sens: true, area: true },
      ],
    },
    {
      key: 'google_ads', name: 'Google Ads', bn: 'গুগল অ্যাডস', icon: 'google_ads', grad: 'from-green-500 to-teal-700',
      vHint: 'GET /customers/{id}', expiry: 'Refresh token — auto',
      fields: [
        { k: 'developer_token', label: 'Developer Token', bn: 'ডেভেলপার টোকেন', desc: 'Google Ads API অ্যাক্সেস টোকেন।', steps: ['ads.google.com → Setup → API Center'], sens: true },
        { k: 'oauth_client_id', label: 'OAuth Client ID', bn: 'অথ ক্লায়েন্ট আইডি', desc: 'GCP OAuth অ্যাপ আইডি।', steps: ['console.cloud.google.com → Credentials'], sens: true },
        { k: 'oauth_client_secret', label: 'OAuth Client Secret', bn: 'অথ সিক্রেট', desc: 'OAuth সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'refresh_token', label: 'Refresh Token', bn: 'রিফ্রেশ টোকেন', desc: 'অটো-রিফ্রেশ টোকেন।', steps: ['OAuth Playground দিয়ে জেনারেট'], sens: true },
        { k: 'customer_id', label: 'Customer ID', bn: 'কাস্টমার আইডি', desc: 'অ্যাড অ্যাকাউন্ট নম্বর।', steps: ['Ads Manager উপরে অ্যাকাউন্ট নম্বর'], pat: '^\\d{3}-\\d{3}-\\d{4}$', hint: 'ফরম্যাট: 123-456-7890' },
        { k: 'manager_id', label: 'Manager Account ID (MCC)', bn: 'ম্যানেজার আইডি', desc: 'MCC থাকলে তার আইডি।', steps: ['MCC না থাকলে স্কিপ করুন'] },
      ],
    },
    {
      key: 'gmb', name: 'Google Business Profile', bn: 'গুগল বিজনেস প্রোফাইল', icon: '📍', grad: 'from-rose-500 to-red-700',
      vHint: 'GET /v1/accounts',
      fields: [
        { k: 'account_id', label: 'Account ID', bn: 'অ্যাকাউন্ট আইডি', desc: 'GBP অ্যাকাউন্ট আইডি।', steps: ['business.google.com → অ্যাকাউন্ট সিলেক্ট'] },
        { k: 'location_id', label: 'Location ID', bn: 'লোকেশন আইডি', desc: 'আউটলেট/ব্রাঞ্চের আইডি।', steps: ['প্রোফাইল API কল করে নিন'] },
        { k: 'oauth_refresh', label: 'OAuth Refresh Token', bn: 'রিফ্রেশ টোকেন', desc: 'GBP স্কোপ টোকেন।', steps: ['OAuth Playground → Google Business Profile API'], sens: true },
      ],
    },
    {
      key: 'bing_webmaster', name: 'Bing Webmaster Tools', bn: 'বিং ওয়েবমাস্টার', icon: '🌐', grad: 'from-cyan-500 to-blue-700',
      vHint: 'GET /api/v1/GetSitesList',
      fields: [
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'Bing Webmaster API কি।', steps: ['bing.com/webmasters → Settings → API access'], sens: true },
        { k: 'site_url', label: 'Verified Site URL', bn: 'ভেরিফাইড সাইট', desc: 'ভেরিফাই করা সাইটের লিংক।', steps: ['সাইট যোগ ও ভেরিফাই করুন'] },
      ],
    },
    {
      key: 'ahrefs', name: 'Ahrefs', bn: 'আহরেফস', icon: '🧭', grad: 'from-orange-500 to-blue-700',
      vHint: 'GET /v3/ahrefs_rank?target=example.com',
      fields: [
        { k: 'api_token', label: 'API Token', bn: 'এপিআই টোকেন', desc: 'Ahrefs API v3 টোকেন।', steps: ['app.ahrefs.com → Settings → API'], sens: true },
        { k: 'plan', label: 'Subscription Plan', bn: 'প্ল্যান', desc: 'Lite/Standard/Advanced/Enterprise।', steps: ['আপনার প্ল্যানের নাম লিখুন'], ph: 'Lite' },
      ],
    },
    {
      key: 'semrush', name: 'SEMrush', bn: 'সেমরাশ', icon: '📈', grad: 'from-orange-500 to-red-700',
      vHint: 'GET /v1/domain_rank?domain=example.com',
      fields: [
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'SEMrush API কি।', steps: ['semrush.com → Profile → API units'], sens: true },
        { k: 'project_id', label: 'Project ID (optional)', bn: 'প্রজেক্ট আইডি', desc: 'নির্দিষ্ট প্রজেক্ট থাকলে।', steps: ['না থাকলে স্কিপ করুন'] },
      ],
    },
    {
      key: 'moz', name: 'Moz', bn: 'মোজ', icon: '🧮', grad: 'from-blue-500 to-green-700',
      vHint: 'GET /v2/url_metrics',
      fields: [
        { k: 'access_id', label: 'Access ID', bn: 'অ্যাক্সেস আইডি', desc: 'Moz API অ্যাক্সেস আইডি।', steps: ['moz.com → API → Access credentials'], sens: true },
        { k: 'secret_key', label: 'Secret Key', bn: 'সিক্রেট কি', desc: 'API সিক্রেট।', steps: ['একই পেজে'], sens: true },
      ],
    },
    {
      key: 'wordpress_seo', name: 'Yoast / Rank Math', bn: 'ইয়োস্ট / র‍্যাংক ম্যাথ', icon: '📝', grad: 'from-violet-500 to-purple-700',
      vHint: 'GET /wp-json/wp/v2/posts',
      fields: [
        { k: 'site_url', label: 'WordPress Site URL', bn: 'সাইট লিংক', desc: 'ওয়ার্ডপ্রেস সাইটের লিংক।', steps: ['আপনার সাইটের URL'] },
        { k: 'app_password', label: 'Application Password', bn: 'অ্যাপ্লিকেশন পাসওয়ার্ড', desc: 'REST API অ্যাপ পাসওয়ার্ড।', steps: ['WP Admin → Users → Profile → Application passwords'], sens: true },
      ],
    },
  ],
};
