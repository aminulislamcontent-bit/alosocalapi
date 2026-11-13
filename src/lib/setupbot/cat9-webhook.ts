import type { SbCategory } from './types';

// 🌐 CATEGORY 9: WEBHOOK / CUSTOM URL — 1 flow
export const CAT_WEBHOOK: SbCategory = {
  key: 'webhook',
  emoji: '🌐',
  name: 'Webhook / Custom URL',
  bn: 'ওয়েবহুক / কাস্টম লিংক',
  desc: 'আপনার নিজের সার্ভার এন্ডপয়েন্ট সংযোগ',
  grad: 'from-cyan-500 to-blue-700',
  platforms: [
    {
      key: 'webhook_custom', name: 'Custom Webhook Endpoint', bn: 'কাস্টম ওয়েবহুক', icon: '🔗', grad: 'from-cyan-500 to-blue-700',
      vHint: 'GET {url}?hub.mode=subscribe&hub.challenge=TEST → expect "TEST"',
      fields: [
        { k: 'url', label: 'HTTPS URL', bn: 'এন্ডপয়েন্ট লিংক', desc: 'আপনার সার্ভারের HTTPS লিংক (HTTP গ্রহণ করা হয় না)।', steps: ['নিজের সার্ভারের webhook URL দিন'], pat: '^https://.+$', hint: 'অবশ্যই https:// দিয়ে শুরু হতে হবে' },
        { k: 'verify_token', label: 'Verify Token / Secret', bn: 'ভেরিফাই টোকেন', desc: 'সার্ভার যাচাইয়ের সিক্রেট স্ট্রিং।', steps: ['আপনার সার্ভার কোডে যেটি সেট করেছেন'], sens: true },
        { k: 'headers', label: 'Expected Headers', bn: 'প্রত্যাশিত হেডার', desc: 'যেমন: X-Signature।', steps: ['হেডার না থাকলে স্কিপ করুন'], ph: 'X-Signature' },
      ],
    },
  ],
};
