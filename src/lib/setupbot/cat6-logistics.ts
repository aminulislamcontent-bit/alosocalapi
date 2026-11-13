import type { SbCategory } from './types';

// 📦 CATEGORY 6: LOGISTICS & DELIVERY (Bangladesh) — 3 platforms
export const CAT_LOGISTICS: SbCategory = {
  key: 'logistics',
  emoji: '📦',
  name: 'Logistics & Delivery',
  bn: 'কুরিয়ার ও ডেলিভারি',
  desc: 'Pathao, RedX, Steadfast — বাংলাদেশের ৩টি কুরিয়ার',
  grad: 'from-amber-500 to-orange-700',
  platforms: [
    {
      key: 'pathao', name: 'Pathao Courier 🇧🇩', bn: 'পাঠাও কুরিয়ার', icon: '🛵', grad: 'from-red-500 to-rose-700',
      vHint: 'POST /aladdin/api/v1/stores',
      fields: [
        { k: 'client_id', label: 'Client ID (API Key)', bn: 'ক্লায়েন্ট আইডি', desc: 'Pathao মার্চেন্ট API আইডি।', steps: ['merchant.pathao.com → Developer/API অপশন'] },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'API সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'store_id', label: 'Store ID', bn: 'স্টোর আইডি', desc: 'পিকআপ স্টোরের আইডি।', steps: ['Merchant panel → Stores → আইডি দেখুন'] },
        { k: 'base_url', label: 'Base URL', bn: 'বেস লিংক', desc: 'sandbox নাকি live।', steps: ['লাইভ: api.pathao.chat'], ph: 'https://api.pathao.chat' },
      ],
    },
    {
      key: 'redx', name: 'RedX 🇧🇩', bn: 'রেডএক্স', icon: '🚚', grad: 'from-red-500 to-orange-700',
      vHint: 'GET /api/v1/merchant/info',
      fields: [
        { k: 'api_token', label: 'API Token (Bearer)', bn: 'এপিআই টোকেন', desc: 'RedX মার্চেন্ট API টোকেন।', steps: ['redx.com.bd মার্চেন্ট প্যানেল → API সেটিংস'], sens: true },
        { k: 'merchant_id', label: 'Merchant ID', bn: 'মার্চেন্ট আইডি', desc: 'আপনার মার্চেন্ট আইডি।', steps: ['প্যানেল প্রোফাইলে দেখুন'] },
      ],
    },
    {
      key: 'steadfast', name: 'Steadfast 🇧🇩', bn: 'স্টেডফাস্ট', icon: '📦', grad: 'from-blue-500 to-indigo-700',
      vHint: 'GET /api/v1/profile',
      fields: [
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'Steadfast অ্যাকাউন্ট API কি।', steps: ['steadfast.com.bd → প্যানেল → API settings'], sens: true },
        { k: 'secret_key', label: 'Secret Key', bn: 'সিক্রেট কি', desc: 'API সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'অ্যাকাউন্ট আইডি (ইমেল/নাম)।', steps: ['প্যানেল প্রোফাইলে দেখুন'] },
      ],
    },
  ],
};
