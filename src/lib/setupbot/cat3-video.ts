import type { SbCategory } from './types';

// 🎥 CATEGORY 3: VIDEO & STREAMING — 6 platforms
export const CAT_VIDEO: SbCategory = {
  key: 'video',
  emoji: '🎥',
  name: 'Video & Streaming',
  bn: 'ভিডিও ও স্ট্রিমিং',
  desc: 'YouTube, Vimeo, Twitch-সহ ৬টি প্ল্যাটফর্ম',
  grad: 'from-red-500 to-rose-700',
  platforms: [
    {
      key: 'youtube_data', name: 'YouTube Data API', bn: 'ইউটিউব ডেটা এপিআই', icon: 'youtube', grad: 'from-red-600 to-red-800',
      vHint: 'GET /youtube/v3/channels?part=snippet&mine=true', expiry: 'OAuth — auto via refresh token',
      fields: [
        { k: 'project_id', label: 'Google Cloud Project ID', bn: 'ক্লাউড প্রজেক্ট আইডি', desc: 'YouTube API সক্রিয় করা প্রজেক্ট।', steps: ['console.cloud.google.com → প্রজেক্ট সিলেক্ট'] },
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'পাবলিক ডেটা আনার কি।', steps: ['APIs & Services → Credentials → API key'], sens: true },
        { k: 'oauth_client_id', label: 'OAuth Client ID', bn: 'অথ ক্লায়েন্ট আইডি', desc: 'OAuth অ্যাপের আইডি।', steps: ['Credentials → Create OAuth client ID'], sens: true },
        { k: 'oauth_client_secret', label: 'OAuth Client Secret', bn: 'অথ সিক্রেট', desc: 'OAuth সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'refresh_token', label: 'Refresh Token', bn: 'রিফ্রেশ টোকেন', desc: 'সিস্টেম নিজেই টোকেন রিফ্রেশ রাখবে।', steps: ['OAuth Playground দিয়ে জেনারেট করুন'], sens: true },
        { k: 'channel_id', label: 'Channel ID', bn: 'চ্যানেল আইডি', desc: 'আপনার ইউটিউব চ্যানেল আইডি।', steps: ['YouTube Studio → Settings → Channel → Advanced'], pat: '^UC[A-Za-z0-9_-]{20,26}$', hint: 'UC দিয়ে শুরু হয়, যেমন: UCxxxxxxxxxxxxxxxxxxxxxx' },
      ],
    },
    {
      key: 'youtube_analytics', name: 'YouTube Analytics', bn: 'ইউটিউব অ্যানালিটিক্স', icon: '📊', grad: 'from-red-500 to-orange-700',
      vHint: 'GET /youtube/analytics/v2/reports?ids=channel==MINE',
      fields: [
        { k: 'channel_id', label: 'Channel ID', bn: 'চ্যানেল আইডি', desc: 'রিপোর্ট আনার চ্যানেল।', steps: ['YouTube Studio → Advanced'] },
        { k: 'oauth_refresh', label: 'OAuth Refresh Token', bn: 'অথ রিফ্রেশ টোকেন', desc: 'yt-analytics.readonly স্কোপ সহ টোকেন।', steps: ['ক্যাটাগরি 3.1-এর একই প্রজেক্ট ব্যবহার করুন'], sens: true },
      ],
    },
    {
      key: 'youtube_live', name: 'YouTube Live', bn: 'ইউটিউব লাইভ', icon: '🔴', grad: 'from-red-500 to-red-700',
      vHint: 'POST /youtube/v3/liveBroadcasts?part=snippet',
      fields: [
        { k: 'stream_key', label: 'Stream Key', bn: 'স্ট্রিম কি', desc: 'লাইভ শুরু করার কি — কাউকে দেবেন না।', steps: ['YouTube Studio → Go Live → Stream key'], sens: true },
        { k: 'rtmp_url', label: 'RTMP Server URL', bn: 'RTMP লিংক', desc: 'স্ট্রিম সার্ভারের ঠিকানা।', steps: ['ডিফল্ট: rtmp://a.rtmp.youtube.com/live2'], ph: 'rtmp://a.rtmp.youtube.com/live2' },
        { k: 'broadcast_id', label: 'Broadcast ID', bn: 'ব্রডকাস্ট আইডি', desc: 'API দিয়ে তৈরি ব্রডকাস্টের আইডি।', steps: ['API দিয়ে তৈরি করলে পাবেন'] },
      ],
    },
    {
      key: 'vimeo', name: 'Vimeo', bn: 'ভিমিও', icon: '🎬', grad: 'from-cyan-500 to-sky-700',
      vHint: 'GET /me',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'Vimeo অ্যাপ আইডি।', steps: ['developer.vimeo.com → My Apps'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'access_token', label: 'Personal Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'public/private/upload স্কোপ টোকেন।', steps: ['My Apps → Generate token'], sens: true },
        { k: 'user_id', label: 'User ID', bn: 'ইউজার আইডি', desc: 'Vimeo অ্যাকাউন্ট আইডি।', steps: ['/me API কল করলে পাবেন'] },
      ],
    },
    {
      key: 'twitch', name: 'Twitch', bn: 'টুইচ', icon: '🟣', grad: 'from-purple-500 to-purple-800',
      vHint: 'GET /helix/users',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'Twitch অ্যাপ আইডি।', steps: ['dev.twitch.tv/console → Applications'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'oauth_token', label: 'OAuth Token', bn: 'অথ টোকেন', desc: 'user:read:email স্কোপ টোকেন।', steps: ['Token generator বা OAuth ফ্লো'], sens: true },
        { k: 'broadcaster_id', label: 'Broadcaster ID', bn: 'ব্রডকাস্টার আইডি', desc: 'চ্যানেলের আইডি।', steps: ['/helix/users কল করে নিন'] },
        { k: 'webhook_secret', label: 'EventSub Secret', bn: 'ইভেন্টসাব সিক্রেট', desc: 'Webhook সিগনেচার যাচাইয়ে।', steps: ['নিজের বানানো শক্তিশালী স্ট্রিং'], sens: true },
      ],
    },
    {
      key: 'dailymotion', name: 'Dailymotion', bn: 'ডেইলিমোশন', icon: '▶️', grad: 'from-blue-400 to-indigo-600',
      vHint: 'GET /user/{id}',
      fields: [
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'Dailymotion অ্যাপ কি।', steps: ['dev.api.dailymotion.com → My apps'], sens: true },
        { k: 'api_secret', label: 'API Secret', bn: 'এপিআই সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'OAuth টোকেন।', steps: ['OAuth ফ্লো চালান'], sens: true },
        { k: 'channel_id', label: 'Channel ID', bn: 'চ্যানেল আইডি', desc: 'আপনার চ্যানেল আইডি।', steps: ['চ্যানেল URL থেকে'] },
      ],
    },
  ],
};
