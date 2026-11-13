import type { SbCategory } from './types';

// 📱 CATEGORY 2: SOCIAL MEDIA — 16 platforms
export const CAT_SOCIAL: SbCategory = {
  key: 'social',
  emoji: '📱',
  name: 'Social Media',
  bn: 'সোশ্যাল মিডিয়া',
  desc: 'Facebook, Instagram, WhatsApp-সহ ১৬টি প্ল্যাটফর্ম',
  grad: 'from-blue-500 to-indigo-700',
  platforms: [
    {
      key: 'facebook_page', name: 'Facebook Page', bn: 'ফেসবুক পেজ', icon: 'facebook', grad: 'from-blue-600 to-blue-800',
      vHint: 'GET /v19.0/{page-id}?fields=name', expiry: 'Long-lived token — 60 days (system user = never)',
      fields: [
        { k: 'page_url', label: 'Page URL', bn: 'পেজ লিংক', desc: 'পেজের সরাসরি লিংক।', steps: ['পেজ ওপেন করে অ্যাড্রেস বার কপি করুন'] },
        { k: 'page_id', label: 'Page ID', bn: 'পেজ আইডি', desc: 'পেজের ইউনিক সংখ্যা।', steps: ['Page → About → Page ID'], pat: '^\\d{15,16}$', hint: '১৫-১৬ সংখ্যার হয়, যেমন: 123456789012345' },
        { k: 'page_access_token', label: 'Long-Lived Page Token', bn: 'পেজ অ্যাক্সেস টোকেন', desc: 'অটো-পোস্ট ও লিড ডেটার মূল টোকেন।', steps: ['developers.facebook.com → Graph API Explorer → Page সিলেক্ট → Generate Token'], sens: true, help: 'https://developers.facebook.com/tools/explorer/' },
        { k: 'app_id', label: 'App ID', bn: 'অ্যাপ আইডি', desc: 'Meta অ্যাপের আইডি।', steps: ['developers.facebook.com → My Apps → App settings'], sens: true },
        { k: 'app_secret', label: 'App Secret', bn: 'অ্যাপ সিক্রেট', desc: 'Meta অ্যাপের সিক্রেট।', steps: ['App settings → Basic → App secret'], sens: true },
      ],
    },
    {
      key: 'facebook_groups', name: 'Facebook Groups', bn: 'ফেসবুক গ্রুপ', icon: '👥', grad: 'from-blue-500 to-cyan-700',
      vHint: 'GET /v19.0/{group-id}?fields=name',
      fields: [
        { k: 'group_id', label: 'Group ID', bn: 'গ্রুপ আইডি', desc: 'গ্রুপের ইউনিক আইডি।', steps: ['গ্রুপ URL/Admin tools থেকে আইডি কপি করুন'] },
        { k: 'page_token', label: 'Page Access Token', bn: 'পেজ টোকেন', desc: 'groups permission সহ টোকেন।', steps: ['Graph API Explorer-এ groups_access_member_info পারমিশন দিন'], sens: true },
      ],
    },
    {
      key: 'facebook_ads', name: 'Facebook Ads', bn: 'ফেসবুক অ্যাডস', icon: '📈', grad: 'from-blue-600 to-purple-700',
      vHint: 'GET /v19.0/act_{id}?fields=name',
      fields: [
        { k: 'ad_account_id', label: 'Ad Account ID', bn: 'অ্যাড অ্যাকাউন্ট আইডি', desc: 'বিজ্ঞাপন অ্যাকাউন্টের আইডি।', steps: ['Ads Manager → অ্যাকাউন্ট ড্রপডাউন'], pat: '^act_\\d{10,20}$', hint: 'act_ দিয়ে শুরু হয়, যেমন: act_1234567890' },
        { k: 'business_id', label: 'Business Manager ID', bn: 'বিজনেস আইডি', desc: 'Business Manager অ্যাকাউন্ট আইডি।', steps: ['business.facebook.com/settings'] },
        { k: 'access_token', label: 'Access Token (ads)', bn: 'অ্যাক্সেস টোকেন', desc: 'ads_management পারমিশন সহ টোকেন।', steps: ['Graph API Explorer → ads_management সিলেক্ট → Generate'], sens: true },
        { k: 'pixel_id', label: 'Pixel ID', bn: 'পিক্সেল আইডি', desc: 'ওয়েবসাইট ট্র্যাকিং পিক্সেল।', steps: ['Events Manager → Pixel সিলেক্ট'], pat: '^\\d{15,16}$', hint: '১৫-১৬ সংখ্যার আইডি' },
      ],
    },
    {
      key: 'instagram', name: 'Instagram Business', bn: 'ইনস্টাগ্রাম বিজনেস', icon: 'instagram', grad: 'from-pink-500 to-purple-700',
      vHint: 'GET /v19.0/{ig-user-id}?fields=username', expiry: 'Long-lived — 60 days',
      fields: [
        { k: 'ig_user_id', label: 'IG Business Account ID', bn: 'বিজনেস অ্যাকাউন্ট আইডি', desc: 'Instagram বিজনেস অ্যাকাউন্টের আইডি।', steps: ['Facebook Page Settings → Linked accounts → View'], pat: '^\\d{10,20}$', hint: 'সংখ্যার আইডি' },
        { k: 'fb_page_id', label: 'Connected Page ID', bn: 'সংযুক্ত পেজ আইডি', desc: 'IG যে ফেসবুক পেজের সাথে যুক্ত।', steps: ['Page Settings → Instagram → Linked'] },
        { k: 'access_token', label: 'Long-Lived Token', bn: 'অ্যাক্সেস টোকেন', desc: 'Graph API টোকেন।', steps: ['Graph API Explorer → Instagram পারমিশন → Generate'], sens: true },
      ],
    },
    {
      key: 'x', name: 'X (Twitter) API v2', bn: 'এক্স (টুইটার)', icon: 'x', grad: 'from-slate-500 to-slate-800',
      vHint: 'GET /2/users/me', expiry: 'OAuth2 token — 2h (refresh)',
      fields: [
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'Developer Portal অ্যাপ কি।', steps: ['developer.x.com → Projects & Apps → Keys'], sens: true },
        { k: 'api_secret', label: 'API Secret', bn: 'এপিআই সিক্রেট', desc: 'API key-র সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'bearer_token', label: 'Bearer Token', bn: 'বিয়ারার টোকেন', desc: 'App-only টোকেন।', steps: ['Keys and tokens → Bearer Token'], sens: true, pat: '^[A-Za-z0-9%]{40,}$', hint: 'লম্বা এনকোডেড টোকেন' },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'ইউজার অ্যাক্সেস টোকেন।', steps: ['Keys and tokens → Access Token & Secret'], sens: true },
        { k: 'access_token_secret', label: 'Access Token Secret', bn: 'অ্যাক্সেস টোকেন সিক্রেট', desc: 'টোকেনের সিক্রেট অংশ।', steps: ['একই পেজে'], sens: true },
      ],
    },
    {
      key: 'linkedin', name: 'LinkedIn', bn: 'লিংকডইন', icon: 'linkedin', grad: 'from-sky-600 to-blue-800',
      vHint: 'GET /v2/me',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'LinkedIn অ্যাপের আইডি।', steps: ['linkedin.com/developers → Your apps'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['Auth ট্যাবে সিক্রেট কপি করুন'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'r_liteprofile + w_member_social স্কোপ টোকেন।', steps: ['3-legged OAuth চালান'], sens: true },
        { k: 'org_urn', label: 'Organization URN', bn: 'অর্গ URN', desc: 'কোম্পানি পেজের আইডি।', steps: ['আপনার পেজের আইডি নম্বর — urn:li:organization:XXXX'], ph: 'urn:li:organization:123456' },
      ],
    },
    {
      key: 'tiktok', name: 'TikTok', bn: 'টিকটক', icon: 'tiktok', grad: 'from-neutral-600 to-black',
      vHint: 'GET /user/info/', expiry: 'Token — 24h (refresh)',
      fields: [
        { k: 'client_key', label: 'Client Key', bn: 'ক্লায়েন্ট কি', desc: 'TikTok অ্যাপের কি।', steps: ['developers.tiktok.com → Manage apps'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'ইউজার টোকেন।', steps: ['OAuth ফ্লো চালান'], sens: true },
        { k: 'open_id', label: 'Open ID', bn: 'ওপেন আইডি', desc: 'ইউজারের ওপেন আইডি।', steps: ['OAuth রেসপন্সে পাবেন'] },
        { k: 'advertiser_id', label: 'Advertiser ID', bn: 'অ্যাডভারটাইজার আইডি', desc: 'TikTok Ads চালালে।', steps: ['ads.tiktok.com → Account info'], help: 'https://ads.tiktok.com/' },
      ],
    },
    {
      key: 'pinterest', name: 'Pinterest', bn: 'পিন্টারেস্ট', icon: 'pinterest', grad: 'from-red-500 to-red-700',
      vHint: 'GET /v5/user_account',
      fields: [
        { k: 'app_id', label: 'App ID', bn: 'অ্যাপ আইডি', desc: 'Pinterest ডেভেলপার অ্যাপ আইডি।', steps: ['developers.pinterest.com → Apps'], sens: true },
        { k: 'app_secret', label: 'App Secret', bn: 'অ্যাপ সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'OAuth টোকেন।', steps: ['Connect app → Get token'], sens: true },
        { k: 'business_id', label: 'Business Account ID', bn: 'বিজনেস আইডি', desc: 'বিজনেস অ্যাকাউন্টের আইডি।', steps: ['Pinterest business profile থেকে'] },
        { k: 'board_id', label: 'Board ID (optional)', bn: 'বোর্ড আইডি', desc: 'নির্দিষ্ট বোর্ডে পিন করতে চাইলে।', steps: ['বোর্ডের URL থেকে আইডি'] },
      ],
    },
    {
      key: 'snapchat', name: 'Snapchat', bn: 'স্ন্যাপচ্যাট', icon: '👻', grad: 'from-yellow-300 to-amber-600',
      vHint: 'GET /v1/organizations/{org_id}',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'Snapchat Business অ্যাপ আইডি।', steps: ['business.snapchat.com → Developer'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'refresh_token', label: 'Refresh Token', bn: 'রিফ্রেশ টোকেন', desc: 'টোকেন রিফ্রেশে লাগে।', steps: ['OAuth ফ্লো চালান'], sens: true },
        { k: 'ad_account_id', label: 'Ad Account ID', bn: 'অ্যাড অ্যাকাউন্ট আইডি', desc: 'Snapchat Ads অ্যাকাউন্ট আইডি।', steps: ['Ads Manager → Account details'] },
        { k: 'org_id', label: 'Organization ID', bn: 'অর্গানাইজেশন আইডি', desc: 'বিজনেস অর্গানাইজেশনের আইডি।', steps: ['Business Manager → Organization'] },
      ],
    },
    {
      key: 'reddit', name: 'Reddit', bn: 'রেডিট', icon: '👾', grad: 'from-orange-500 to-orange-700',
      vHint: 'GET /api/v1/me',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'Script অ্যাপের আইডি।', steps: ['reddit.com/prefs/apps → Create app (script)'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'username', label: 'Username', bn: 'ইউজারনেম', desc: 'বট অ্যাকাউন্টের ইউজারনেম।', steps: ['নিজের ইউজারনেম দিন'] },
        { k: 'password', label: 'Account Password', bn: 'অ্যাকাউন্ট পাসওয়ার্ড', desc: 'Script অ্যাপে দরকার হয় — শুধু API কলে ব্যবহৃত হয়।', steps: ['অ্যাকাউন্টের পাসওয়ার্ড দিন'], sens: true },
        { k: 'user_agent', label: 'User Agent String', bn: 'ইউজার এজেন্ট', desc: 'API কলের পরিচয় স্ট্রিং।', steps: ['যেমন: web:alo-bot:v1.0 (by /u/yourname)'], ph: 'web:mybot:v1.0 (by /u/you)' },
      ],
    },
    {
      key: 'threads', name: 'Threads', bn: 'থ্রেডস', icon: '🧵', grad: 'from-neutral-500 to-neutral-800',
      vHint: 'GET /v1.0/{threads-user-id}?fields=username',
      fields: [
        { k: 'app_id', label: 'App ID', bn: 'অ্যাপ আইডি', desc: 'Meta অ্যাপের আইডি (Threads অ্যাক্সেস সহ)।', steps: ['developers.facebook.com → অ্যাপ → Threads settings'], sens: true },
        { k: 'app_secret', label: 'App Secret', bn: 'অ্যাপ সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['App settings → Basic'], sens: true },
        { k: 'user_id', label: 'Threads User ID', bn: 'থ্রেডস ইউজার আইডি', desc: 'আপনার Threads অ্যাকাউন্ট আইডি।', steps: ['API দিয়ে /me কল করলে পাবেন'] },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'Threads API টোকেন।', steps: ['OAuth ফ্লো চালান'], sens: true },
      ],
    },
    {
      key: 'mastodon', name: 'Mastodon', bn: 'মাস্টোডন', icon: '🐘', grad: 'from-purple-500 to-indigo-700',
      vHint: 'GET /api/v1/accounts/verify_credentials',
      fields: [
        { k: 'instance_url', label: 'Instance URL', bn: 'ইনস্ট্যান্স লিংক', desc: 'আপনার সার্ভারের লিংক।', steps: ['যেমন: mastodon.social'], ph: 'mastodon.social' },
        { k: 'client_key', label: 'Client Key', bn: 'ক্লায়েন্ট কি', desc: 'অ্যাপের client key।', steps: ['Preferences → Development → New application'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'অ্যাকাউন্ট টোকেন।', steps: ['অ্যাপ তৈরির সময় পাওয়া টোকেন'], sens: true },
      ],
    },
    {
      key: 'bluesky', name: 'Bluesky (AT Protocol)', bn: 'ব্লুস্কাই', icon: '🦋', grad: 'from-sky-400 to-blue-600',
      vHint: 'POST com.atproto.server.createSession',
      fields: [
        { k: 'handle', label: 'Handle', bn: 'হ্যান্ডেল', desc: 'আপনার ব্লুস্কাই ইউজারনেম।', steps: ['যেমন: yourname.bsky.social'], ph: 'you.bsky.social' },
        { k: 'app_password', label: 'App Password', bn: 'অ্যাপ পাসওয়ার্ড', desc: 'Settings-এ তৈরি করা অ্যাপ-পাসওয়ার্ড (মূল পাসওয়ার্ড নয়)।', steps: ['Settings → App passwords → Create'], sens: true },
        { k: 'pds_url', label: 'PDS URL (optional)', bn: 'PDS লিংক', desc: 'ডিফল্ট bsky.social থাকলে খালি রাখুন।', steps: ['খালি রাখতে পারেন'] },
      ],
    },
    {
      key: 'discord', name: 'Discord', bn: 'ডিসকর্ড', icon: '🎮', grad: 'from-indigo-500 to-indigo-800',
      vHint: 'GET /api/v10/users/@me',
      fields: [
        { k: 'bot_token', label: 'Bot Token', bn: 'বট টোকেন', desc: 'Discord বটের টোকেন।', steps: ['discord.com/developers → Bot → Reset Token'], sens: true },
        { k: 'app_id', label: 'Application (Client) ID', bn: 'অ্যাপ্লিকেশন আইডি', desc: 'বট অ্যাপ্লিকেশন আইডি।', steps: ['General Information → Application ID'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'OAuth সিক্রেট।', steps: ['OAuth2 → Client secret'], sens: true },
        { k: 'guild_id', label: 'Guild (Server) ID', bn: 'সার্ভার আইডি', desc: 'যে সার্ভারে বট কাজ করবে।', steps: ['Developer mode on → Server এ রাইট ক্লিক → Copy ID'] },
        { k: 'public_key', label: 'Public Key', bn: 'পাবলিক কি', desc: 'Interactions ভেরিফিকেশনে লাগে।', steps: ['General Information → Public Key'] },
      ],
    },
    {
      key: 'telegram', name: 'Telegram', bn: 'টেলিগ্রাম', icon: 'telegram', grad: 'from-sky-500 to-cyan-700',
      vHint: 'GET /bot{token}/getMe',
      fields: [
        { k: 'bot_token', label: 'Bot Token', bn: 'বট টোকেন', desc: '@BotFather দেওয়া বট টোকেন।', steps: ['টেলিগ্রামে @BotFather ওপেন করুন', '/newbot → নাম দিন → টোকেন কপি করুন'], sens: true, pat: '^\\d{8,12}:[A-Za-z0-9_-]{30,}$', hint: 'ফরম্যাট: 123456789:ABCdef... (কোলন সহ)' },
        { k: 'chat_id', label: 'Chat / Channel ID', bn: 'চ্যাট আইডি', desc: 'মেসেজ পাঠানোর চ্যানেল/চ্যাট।', steps: ['@userinfobot বা getUpdates API দিয়ে আইডি নিন'], ph: '-1001234567890' },
        { k: 'api_id', label: 'API ID (MTProto)', bn: 'এপিআই আইডি', desc: 'শুধু userbot/MTProto হলে লাগবে।', steps: ['my.telegram.org → API development tools'], sens: true },
        { k: 'api_hash', label: 'API Hash (MTProto)', bn: 'এপিআই হ্যাশ', desc: 'API ID-র হ্যাশ।', steps: ['একই পেজে'], sens: true },
      ],
    },
    {
      key: 'whatsapp', name: 'WhatsApp Business Cloud API', bn: 'হোয়াটসঅ্যাপ বিজনেস', icon: 'whatsapp', grad: 'from-emerald-500 to-green-700',
      vHint: 'GET /v19.0/{phone-id}?fields=quality_rating', expiry: 'System user token — never',
      fields: [
        { k: 'wa_display_phone', label: 'Business Phone Number', bn: 'বিজনেস নম্বর', desc: 'যে নম্বর থেকে মেসেজ যাবে।', steps: ['দেশের কোড সহ লিখুন'], ph: '+8801XXXXXXXXX' },
        { k: 'phone_number_id', label: 'Phone Number ID', bn: 'ফোন নাম্বার আইডি', desc: 'WhatsApp API-র মূল আইডি।', steps: ['developers.facebook.com → অ্যাপ → WhatsApp → API Setup'], pat: '^\\d{10,20}$', hint: 'সংখ্যার আইডি' },
        { k: 'waba_id', label: 'WABA ID', bn: 'হোয়াটসঅ্যাপ অ্যাকাউন্ট আইডি', desc: 'WhatsApp Business Account আইডি।', steps: ['একই API Setup পেজে উপরে দেখাবে'] },
        { k: 'system_user_token', label: 'System User Token', bn: 'সিস্টেম ইউজার টোকেন', desc: 'পার্মানেন্ট টোকেন — কখনো শেষ হয় না।', steps: ['business.facebook.com/settings → System Users → Generate Token'], sens: true },
        { k: 'webhook_verify_token', label: 'Webhook Verify Token', bn: 'ওয়েবহুক ভেরিফাই টোকেন', desc: 'আপনার নিজের বানানো সিক্রেট স্ট্রিং।', steps: ['যেকোনো শক্তিশালী স্ট্রিং বানিয়ে দিন'], sens: true },
        { k: 'app_secret', label: 'App Secret (webhook sign)', bn: 'অ্যাপ সিক্রেট', desc: 'Webhook সিগনেচার যাচাইয়ে লাগে।', steps: ['App settings → Basic → App secret'], sens: true },
      ],
    },
  ],
};
