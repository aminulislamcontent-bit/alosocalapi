import type { SbCategory } from './types';

// 📝 CATEGORY 8: CONTENT & SCHEDULING — 8 platforms
export const CAT_CONTENT: SbCategory = {
  key: 'content',
  emoji: '📝',
  name: 'Content & Scheduling',
  bn: 'কনটেন্ট ও শিডিউলিং',
  desc: 'Canva, WordPress, Notion, Slack-সহ ৮টি টুল',
  grad: 'from-pink-500 to-rose-700',
  platforms: [
    {
      key: 'buffer', name: 'Buffer', bn: 'বাফার', icon: '⏱️', grad: 'from-emerald-500 to-teal-700',
      vHint: 'GET /1/profiles.json',
      fields: [
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'Buffer API টোকেন।', steps: ['buffer.com/app/account/api'], sens: true },
        { k: 'profile_ids', label: 'Profile ID(s)', bn: 'প্রোফাইল আইডি', desc: 'যেসব চ্যানেলে পোস্ট হবে।', steps: ['API /profiles কল করে আইডি নিন'] },
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'Buffer অ্যাপ আইডি।', steps: ['developers.buffer.com'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
      ],
    },
    {
      key: 'hootsuite', name: 'Hootsuite', bn: 'হুটসুইট', icon: '🦉', grad: 'from-slate-500 to-gray-700',
      vHint: 'GET /v1/me',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'Hootsuite অ্যাপ আইডি।', steps: ['apps.hootsuite.com → Developer'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'OAuth টোকেন।', steps: ['OAuth ফ্লো চালান'], sens: true },
        { k: 'refresh_token', label: 'Refresh Token', bn: 'রিফ্রেশ টোকেন', desc: 'টোকেন রিফ্রেশে।', steps: ['OAuth রেসপন্সে পাবেন'], sens: true },
      ],
    },
    {
      key: 'later', name: 'Later', bn: 'লেটার', icon: '🕰️', grad: 'from-pink-500 to-purple-700',
      vHint: 'GET /api/v2/profiles',
      fields: [
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'Later API কি।', steps: ['later.com → Account settings → API'], sens: true },
        { k: 'account_id', label: 'Account ID', bn: 'অ্যাকাউন্ট আইডি', desc: 'Later অ্যাকাউন্ট আইডি।', steps: ['প্যানেল সেটিংসে'] },
      ],
    },
    {
      key: 'canva', name: 'Canva Connect', bn: 'ক্যানভা', icon: 'canva', grad: 'from-cyan-400 to-teal-600',
      vHint: 'GET /v1/scopes',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'Canva Connect অ্যাপ আইডি।', steps: ['canva.com/developers → Your app'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'OAuth টোকেন।', steps: ['Connect flow চালান'], sens: true },
      ],
    },
    {
      key: 'medium', name: 'Medium', bn: 'মিডিয়াম', icon: '✍️', grad: 'from-neutral-500 to-neutral-800',
      vHint: 'GET /v1/me',
      fields: [
        { k: 'integration_token', label: 'Integration Token', bn: 'ইন্টিগ্রেশন টোকেন', desc: 'Medium পোস্ট করার টোকেন।', steps: ['medium.com → Settings → Integration tokens'], sens: true },
        { k: 'user_id', label: 'User ID', bn: 'ইউজার আইডি', desc: '/me কল করে পাবেন।', steps: ['API দিয়ে /me কল করুন'] },
      ],
    },
    {
      key: 'wordpress', name: 'WordPress REST API', bn: 'ওয়ার্ডপ্রেস', icon: 'wordpress', grad: 'from-sky-500 to-blue-700',
      vHint: 'GET /wp-json/wp/v2/users/me',
      fields: [
        { k: 'site_url', label: 'Site URL', bn: 'সাইট লিংক', desc: 'ওয়ার্ডপ্রেস সাইটের লিংক।', steps: ['আপনার সাইটের URL দিন'] },
        { k: 'username', label: 'Username', bn: 'ইউজারনেম', desc: 'পোস্ট করার ইউজারনেম।', steps: ['WP Admin ইউজারনেম'] },
        { k: 'app_password', label: 'Application Password', bn: 'অ্যাপ্লিকেশন পাসওয়ার্ড', desc: 'মূল পাসওয়ার্ড নয় — অ্যাপ পাসওয়ার্ড।', steps: ['WP Admin → Users → Profile → Application passwords'], sens: true },
      ],
    },
    {
      key: 'notion', name: 'Notion', bn: 'নোশন', icon: 'notion', grad: 'from-slate-500 to-neutral-800',
      vHint: 'GET /v1/users/me', expiry: 'Integration token — never',
      fields: [
        { k: 'integration_token', label: 'Internal Integration Token', bn: 'ইন্টিগ্রেশন টোকেন', desc: 'secret_ দিয়ে শুরু হয়।', steps: ['notion.so/my-integrations → New integration'], sens: true, pat: '^secret_[A-Za-z0-9]{30,}$', hint: 'secret_ দিয়ে শুরু হয়' },
        { k: 'database_ids', label: 'Database ID(s)', bn: 'ডেটাবেস আইডি', desc: 'যেসব ডেটাবেসে কাজ করবে (কমা দিয়ে একাধিক)।', steps: ['Notion ডেটাবেস লিংক থেকে ৩২-অক্ষরের আইডি কপি করুন'] },
      ],
    },
    {
      key: 'slack', name: 'Slack', bn: 'স্ল্যাক', icon: 'slack', grad: 'from-purple-500 to-fuchsia-700',
      vHint: 'GET /api/auth.test',
      fields: [
        { k: 'bot_token', label: 'Bot User OAuth Token', bn: 'বট টোকেন', desc: 'xoxb- দিয়ে শুরু হয়।', steps: ['api.slack.com/apps → OAuth & Permissions'], sens: true, pat: '^xoxb-[A-Za-z0-9-]{20,}$', hint: 'xoxb- দিয়ে শুরু হয়' },
        { k: 'signing_secret', label: 'Signing Secret', bn: 'সাইনিং সিক্রেট', desc: 'Request যাচাইয়ে লাগে।', steps: ['App settings → Basic information'], sens: true },
        { k: 'channel_ids', label: 'Channel ID(s)', bn: 'চ্যানেল আইডি', desc: 'মেসেজ যাবে যেসব চ্যানেলে।', steps: ['Slack চ্যানেলের ডিটেইলস থেকে আইডি কপি'] },
      ],
    },
  ],
};
