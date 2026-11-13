import type { SbCategory } from './types';

// 💳 CATEGORY 5: PAYMENT GATEWAYS — 5 platforms
export const CAT_PAYMENT: SbCategory = {
  key: 'payment',
  emoji: '💳',
  name: 'Payment Gateways',
  bn: 'পেমেন্ট গেটওয়ে',
  desc: 'SSLCommerz, bKash, Stripe-সহ ৫টি গেটওয়ে',
  grad: 'from-emerald-500 to-green-700',
  platforms: [
    {
      key: 'stripe', name: 'Stripe', bn: 'স্ট্রাইপ', icon: 'stripe', grad: 'from-indigo-500 to-violet-700',
      vHint: 'GET /v1/account', expiry: 'Secret key — never',
      fields: [
        { k: 'publishable_key', label: 'Publishable Key', bn: 'পাবলিশেবল কি', desc: 'ফ্রন্টএন্ডে ব্যবহারের কি।', steps: ['dashboard.stripe.com → Developers → API keys'], pat: '^pk_(test|live)_[A-Za-z0-9]{10,}$', hint: 'pk_live_ বা pk_test_ দিয়ে শুরু হয়' },
        { k: 'secret_key', label: 'Secret Key', bn: 'সিক্রেট কি', desc: 'পেমেন্ট চার্জ করার মূল কি — সবচেয়ে গোপনীয়।', steps: ['একই পেজে Reveal secret key'], sens: true, pat: '^sk_(test|live)_[A-Za-z0-9]{10,}$', hint: 'sk_live_ বা sk_test_ দিয়ে শুরু হয়' },
        { k: 'webhook_secret', label: 'Webhook Signing Secret', bn: 'ওয়েবহুক সিক্রেট', desc: 'whsec_ দিয়ে শুরু — ইভেন্ট যাচাইয়ে।', steps: ['Developers → Webhooks → Signing secret'], sens: true, pat: '^whsec_[A-Za-z0-9]{10,}$', hint: 'whsec_ দিয়ে শুরু হয়' },
        { k: 'connected_account', label: 'Connected Account (optional)', bn: 'কানেক্টেড অ্যাকাউন্ট', desc: 'Marketplace হলে acct_xxx।', steps: ['না থাকলে স্কিপ করুন'], pat: '^acct_[A-Za-z0-9]{10,}$', hint: 'acct_ দিয়ে শুরু হয়' },
      ],
    },
    {
      key: 'paypal', name: 'PayPal', bn: 'পেপাল', icon: 'paypal', grad: 'from-blue-500 to-blue-800',
      vHint: 'POST /v1/oauth2/token',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'PayPal অ্যাপ আইডি।', steps: ['developer.paypal.com → My apps & credentials'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই অ্যাপে Secret দেখুন'], sens: true },
        { k: 'webhook_id', label: 'Webhook ID', bn: 'ওয়েবহুক আইডি', desc: 'ওয়েবহুক যাচাইয়ে লাগে।', steps: ['My apps → Webhooks → আইডি কপি'] },
        { k: 'environment', label: 'Environment', bn: 'এনভায়রনমেন্ট', desc: 'sandbox নাকি live।', steps: ['আসল পেমেন্ট হলে: live'], ph: 'live' },
      ],
    },
    {
      key: 'sslcommerz', name: 'SSLCommerz 🇧🇩', bn: 'এসএসএলকমার্জ', icon: 'sslcommerz', grad: 'from-orange-500 to-red-700',
      vHint: 'POST /gwprocess/v4/gw.php', expiry: 'Store password — never',
      fields: [
        { k: 'store_id', label: 'Store ID', bn: 'স্টোর আইডি', desc: 'SSLCommerz প্যানেলের স্টোর আইডি।', steps: ['developer.sslcommerz.com → আপনার স্টোর আইডি'] },
        { k: 'store_password', label: 'Store Password (API)', bn: 'স্টোর পাসওয়ার্ড', desc: 'API কলের পাসওয়ার্ড।', steps: ['প্যানেল → My stores → API credentials'], sens: true },
        { k: 'api_domain', label: 'API Domain', bn: 'এপিআই ডোমেইন', desc: 'sandbox নাকি live।', steps: ['লাইভ হলে: securepay.sslcommerz.com'], ph: 'securepay.sslcommerz.com' },
        { k: 'callback_urls', label: 'Success/Fail/Cancel/IPN URLs', bn: 'কলব্যাক লিংকগুলো', desc: 'পেমেন্ট শেষে যেখানে ফিরবে।', steps: ['৪টি লিংক লাইন ধরে দিন (Success, Fail, Cancel, IPN)'], area: true },
      ],
    },
    {
      key: 'bkash', name: 'bKash 🇧🇩', bn: 'বিকাশ', icon: 'bkash', grad: 'from-pink-500 to-rose-700',
      vHint: 'POST /tokenized/checkout/create', expiry: 'Token grant — 1h (auto)',
      fields: [
        { k: 'app_key', label: 'App Key', bn: 'অ্যাপ কি', desc: 'bKash PGW অ্যাপ কি।', steps: ['merchant portal → Checkout app credentials'] },
        { k: 'app_secret', label: 'App Secret', bn: 'অ্যাপ সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে'], sens: true },
        { k: 'username', label: 'Username (PGW)', bn: 'ইউজারনেম', desc: 'PGW API ইউজারনেম।', steps: ['একই পেজে'] },
        { k: 'password', label: 'Password (PGW)', bn: 'পাসওয়ার্ড', desc: 'PGW API পাসওয়ার্ড।', steps: ['একই পেজে'], sens: true },
        { k: 'grant_url', label: 'Grant Token URL', bn: 'টোকেন লিংক', desc: 'sandbox নাকি live লিংক।', steps: ['লাইভ: tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant'], ph: 'https://tokenized.pay.bka.sh/...' },
        { k: 'environment', label: 'Environment', bn: 'এনভায়রনমেন্ট', desc: 'sandbox নাকি live।', steps: ['আসল লেনদেন হলে: live'], ph: 'live' },
      ],
    },
    {
      key: 'razorpay', name: 'Razorpay 🇮🇳', bn: 'রেজরপে', icon: 'razorpay', grad: 'from-blue-500 to-slate-700',
      vHint: 'GET /v1/payments',
      fields: [
        { k: 'key_id', label: 'Key ID', bn: 'কি আইডি', desc: 'rzp_live_xxx বা rzp_test_xxx।', steps: ['dashboard.razorpay.com → Settings → API keys'], pat: '^rzp_(test|live)_[A-Za-z0-9]{10,}$', hint: 'rzp_live_ দিয়ে শুরু হয়' },
        { k: 'key_secret', label: 'Key Secret', bn: 'কি সিক্রেট', desc: 'API সিক্রেট।', steps: ['একই পেজে সিক্রেট দেখুন'], sens: true },
        { k: 'webhook_secret', label: 'Webhook Secret', bn: 'ওয়েবহুক সিক্রেট', desc: 'ইভেন্ট যাচাইয়ে।', steps: ['Webhooks সেটআপের সময় দিন'], sens: true },
      ],
    },
  ],
};
