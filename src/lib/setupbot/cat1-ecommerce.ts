import type { SbCategory } from './types';

// 🛒 CATEGORY 1: E-COMMERCE MARKETPLACES — 10 platforms
export const CAT_ECOMMERCE: SbCategory = {
  key: 'ecommerce',
  emoji: '🛒',
  name: 'E-Commerce Marketplaces',
  bn: 'ই-কমার্স মার্কেটপ্লেস',
  desc: 'Amazon, Shopify, Daraz-সহ ১০টি মার্কেটপ্লেস সংযোগ',
  grad: 'from-orange-500 to-amber-700',
  platforms: [
    {
      key: 'amazon', name: 'Amazon SP-API', bn: 'অ্যামাজন সেলার', icon: '📦', grad: 'from-amber-500 to-orange-700',
      vHint: 'POST /tokens/2021-03-01/restrictedDataToken', expiry: 'Refresh token — never',
      fields: [
        { k: 'client_id', label: 'Client ID (LWA)', bn: 'ক্লায়েন্ট আইডি', desc: 'Login with Amazon অ্যাপের আইডি।', steps: ['sellercentral.amazon.com → Settings → User Permissions → LWA অ্যাপ দেখুন'], ph: 'amzn1.application-oa2-client.xxxx' },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'LWA অ্যাপের সিক্রেট — টোকেন রিফ্রেশে লাগে।', steps: ['একই পেজে Client Secret কপি করুন'], sens: true },
        { k: 'refresh_token', label: 'Refresh Token', bn: 'রিফ্রেশ টোকেন', desc: 'এটি দিয়ে সিস্টেম নিজেই নতুন অ্যাক্সেস টোকেন নেবে।', steps: ['অ্যাপ অথরাইজ করার সময় পাওয়া Refresh Token পেস্ট করুন'], sens: true, expiry: 'auto' },
        { k: 'role_arn', label: 'AWS IAM Role ARN', bn: 'AWS রোল ARN', desc: 'SP-API কলের জন্য IAM রোল।', steps: ['AWS Console → IAM → Role → ARN কপি করুন'], ph: 'arn:aws:iam::123456789:role/xxx' },
        { k: 'seller_id', label: 'Seller ID', bn: 'সেলার আইডি', desc: 'আপনার মার্চেন্ট টোকেন।', steps: ['Seller Central → Account Info → Merchant Token'], pat: '^[A-Z0-9]{13,20}$', hint: 'A2XXX দিয়ে শুরু হয় ১৩-২০ অক্ষরের কোড' },
        { k: 'marketplace_id', label: 'Marketplace ID', bn: 'মার্কেটপ্লেস আইডি', desc: 'কোন দেশের মার্কেট — যেমন US।', steps: ['US হলে: ATVPDKIKX0DER'], ph: 'ATVPDKIKX0DER' },
      ],
    },
    {
      key: 'ebay', name: 'eBay', bn: 'ইবে', icon: '🏷️', grad: 'from-red-500 to-rose-700',
      vHint: 'GET /sell/account/v1/privilege',
      fields: [
        { k: 'app_id', label: 'App ID (Client ID)', bn: 'অ্যাপ আইডি', desc: 'eBay Developer Program অ্যাপ আইডি।', steps: ['developer.ebay.com → Application Keys'], ph: 'AppName-AppID-PRD-xxxx' },
        { k: 'cert_id', label: 'Cert ID (Client Secret)', bn: 'সার্ট আইডি', desc: 'OAuth সিক্রেট।', steps: ['একই পেজে Cert ID (PRD) কপি করুন'], sens: true },
        { k: 'user_token', label: 'User Access Token', bn: 'ইউজার টোকেন', desc: 'অ্যাকাউন্ট অথরাইজ করে পাওয়া টোকেন।', steps: ['eBay OAuth → Generate User Token'], sens: true },
        { k: 'runame', label: 'RuName', bn: 'রু-নেম', desc: 'Redirect URL name — OAuth সেটআপে লাগে।', steps: ['Developer portal → RuName কপি করুন'] },
        { k: 'site_id', label: 'Site ID', bn: 'সাইট আইডি', desc: 'US=0, India=203।', steps: ['যে সাইটে বিক্রি করেন সেটির আইডি'], ph: '0' },
      ],
    },
    {
      key: 'shopify', name: 'Shopify', bn: 'শপিফাই', icon: '🛍️', grad: 'from-lime-500 to-green-700',
      vHint: 'GET /admin/api/2024-01/shop.json', expiry: 'Admin token — never',
      fields: [
        { k: 'store_url', label: 'Store URL', bn: 'স্টোর লিংক', desc: 'আপনার .myshopify.com লিংক।', steps: ['Shopify Admin-এর ঠিকানা কপি করুন'], ph: 'yourstore.myshopify.com' },
        { k: 'admin_token', label: 'Admin API Access Token', bn: 'অ্যাডমিন টোকেন', desc: 'Custom app টোকেন — অর্ডার/প্রোডাক্ট ম্যানেজে লাগে।', steps: ['Settings → Apps → Develop apps → Create app → Admin API → Install'], sens: true, pat: '^shpat_[a-zA-Z0-9]{20,}$', hint: 'shpat_ দিয়ে শুরু হয়' },
        { k: 'api_key', label: 'API Key', bn: 'এপিআই কি', desc: 'Custom app এর API key।', steps: ['একই অ্যাপের API credentials সেকশনে'], sens: true },
        { k: 'api_secret', label: 'API Secret Key', bn: 'এপিআই সিক্রেট', desc: 'Webhook ভেরিফিকেশনে লাগে।', steps: ['একই সেকশনে API secret key'], sens: true },
      ],
    },
    {
      key: 'woocommerce', name: 'WooCommerce', bn: 'উউকমার্স', icon: '🛒', grad: 'from-violet-500 to-purple-700',
      vHint: 'GET /wp-json/wc/v3/system_status',
      fields: [
        { k: 'store_url', label: 'Store URL', bn: 'স্টোর লিংক', desc: 'ওয়ার্ডপ্রেস সাইটের লিংক।', steps: ['আপনার সাইটের URL দিন'], ph: 'https://yourshop.com' },
        { k: 'consumer_key', label: 'Consumer Key', bn: 'কনজিউমার কি', desc: 'WooCommerce REST API কি।', steps: ['WooCommerce → Settings → Advanced → REST API → Add key'], pat: '^ck_[a-f0-9]{30,}$', hint: 'ck_ দিয়ে শুরু হয়' },
        { k: 'consumer_secret', label: 'Consumer Secret', bn: 'কনজিউমার সিক্রেট', desc: 'REST API সিক্রেট।', steps: ['একই কি তৈরির সময় পাওয়া সিক্রেট'], sens: true, pat: '^cs_[a-f0-9]{30,}$', hint: 'cs_ দিয়ে শুরু হয়' },
        { k: 'webhook_secret', label: 'Webhook Secret', bn: 'ওয়েবহুক সিক্রেট', desc: 'ঐচ্ছিক — ওয়েবহুক সাইন চেকে লাগে।', steps: ['না থাকলে স্কিপ করুন'], sens: true },
      ],
    },
    {
      key: 'etsy', name: 'Etsy', bn: 'এটসি', icon: '🎨', grad: 'from-orange-400 to-rose-600',
      vHint: 'GET /v3/application/shops/{shop_id}',
      fields: [
        { k: 'keystring', label: 'API Keystring', bn: 'এপিআই কি', desc: 'Etsy অ্যাপের keystring।', steps: ['etsy.com/developers → Your apps'], sens: true },
        { k: 'shared_secret', label: 'Shared Secret', bn: 'শেয়ার্ড সিক্রেট', desc: 'OAuth সিগনেচারে লাগে।', steps: ['একই পেজে সিক্রেট কপি করুন'], sens: true },
        { k: 'oauth_token', label: 'OAuth Token', bn: 'অথ টোকেন', desc: 'অ্যাকাউন্ট অথরাইজ টোকেন।', steps: ['Connect your Etsy account ফ্লো চালান'], sens: true },
        { k: 'shop_id', label: 'Shop ID', bn: 'শপ আইডি', desc: 'আপনার Etsy শপের আইডি।', steps: ['Shop Manager → Settings → Shop info'] },
      ],
    },
    {
      key: 'daraz', name: 'Daraz', bn: 'দারাজ', icon: '🛒', grad: 'from-orange-500 to-red-700',
      vHint: 'GET /rest/api/getSellerInfo',
      fields: [
        { k: 'app_key', label: 'App Key', bn: 'অ্যাপ কি', desc: 'Daraz Open Platform অ্যাপ কি।', steps: ['open.daraz.com.bd → App management'], sens: true },
        { k: 'app_secret', label: 'App Secret', bn: 'অ্যাপ সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে সিক্রেট কপি করুন'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'অথরাইজের টোকেন।', steps: ['অথরাইজ ফ্লো চালিয়ে টোকেন নিন'], sens: true },
        { k: 'shop_id', label: 'Seller / Shop ID', bn: 'শপ আইডি', desc: 'সেলার সেন্টারের আইডি।', steps: ['Seller Center → Profile এ আইডি দেখুন'] },
      ],
    },
    {
      key: 'flipkart', name: 'Flipkart', bn: 'ফ্লিপকার্ট', icon: '🛒', grad: 'from-yellow-400 to-blue-600',
      vHint: 'GET /v2/listings',
      fields: [
        { k: 'app_id', label: 'Application ID', bn: 'অ্যাপ্লিকেশন আইডি', desc: 'Flipkart Seller API অ্যাপ আইডি।', steps: ['seller.flipkart.com → API access'], sens: true },
        { k: 'app_secret', label: 'Application Secret', bn: 'অ্যাপ সিক্রেট', desc: 'অ্যাপ সিক্রেট।', steps: ['একই পেজে সিক্রেট'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'জেনারেট করা টোকেন।', steps: ['টোকেন জেনারেট করে পেস্ট করুন'], sens: true },
        { k: 'seller_id', label: 'Seller ID', bn: 'সেলার আইডি', desc: 'আপনার সেলার প্যানেল আইডি।', steps: ['Seller Panel → Profile'] },
      ],
    },
    {
      key: 'walmart', name: 'Walmart Marketplace', bn: 'ওয়ালমার্ট', icon: '🏬', grad: 'from-blue-400 to-sky-700',
      vHint: 'GET /v3/items (WFS)',
      fields: [
        { k: 'consumer_id', label: 'Consumer ID', bn: 'কনজিউমার আইডি', desc: 'Walmart Developer কনজিউমার আইডি।', steps: ['Walmart Developer → API keys'], sens: true },
        { k: 'private_key', label: 'Private Key (PEM)', bn: 'প্রাইভেট কি', desc: 'Base64 PEM প্রাইভেট কি।', steps: ['Client secret হিসেবে জেনারেট করা PEM পেস্ট করুন'], sens: true, area: true },
        { k: 'channel_type', label: 'Channel Type', bn: 'চ্যানেল টাইপ', desc: 'API চ্যানেলের ধরন।', steps: ['সাধারণত: Marketplace'], ph: 'Marketplace' },
      ],
    },
    {
      key: 'bigcommerce', name: 'BigCommerce', bn: 'বিগকমার্স', icon: '🛒', grad: 'from-green-500 to-emerald-700',
      vHint: 'GET /stores/{hash}/v2/store',
      fields: [
        { k: 'client_id', label: 'Client ID', bn: 'ক্লায়েন্ট আইডি', desc: 'API অ্যাকাউন্টের ক্লায়েন্ট আইডি।', steps: ['Advanced Settings → API Accounts'], sens: true },
        { k: 'client_secret', label: 'Client Secret', bn: 'ক্লায়েন্ট সিক্রেট', desc: 'API সিক্রেট।', steps: ['একই অ্যাকাউন্টে সিক্রেট'], sens: true },
        { k: 'access_token', label: 'Access Token', bn: 'অ্যাক্সেস টোকেন', desc: 'স্টোর API টোকেন।', steps: ['তৈরির সময় পাওয়া টোকেন'], sens: true },
        { k: 'store_hash', label: 'Store Hash', bn: 'স্টোর হ্যাশ', desc: 'আপনার URL-এর হ্যাশ অংশ।', steps: ['URL থেকে store-xxxxx অংশটি কপি করুন'], ph: 'store-abc123' },
      ],
    },
    {
      key: 'magento', name: 'Magento / Adobe Commerce', bn: 'ম্যাজেন্টো', icon: '🧩', grad: 'from-orange-600 to-red-800',
      vHint: 'GET /rest/V1/store/storeConfigs',
      fields: [
        { k: 'base_url', label: 'Base URL', bn: 'সাইট লিংক', desc: 'Magento সাইটের মূল লিংক।', steps: ['আপনার স্টোরের URL দিন'], ph: 'https://yourstore.com' },
        { k: 'integration_token', label: 'Integration Access Token', bn: 'ইন্টিগ্রেশন টোকেন', desc: 'Admin → Integration টোকেন।', steps: ['System → Integrations → Activate'], sens: true },
        { k: 'consumer_key', label: 'Consumer Key', bn: 'কনজিউমার কি', desc: 'OAuth কনজিউমার কি।', steps: ['Integration ডিটেইলসে'], sens: true },
        { k: 'consumer_secret', label: 'Consumer Secret', bn: 'কনজিউমার সিক্রেট', desc: 'OAuth সিক্রেট।', steps: ['Integration ডিটেইলসে'], sens: true },
      ],
    },
  ],
};
