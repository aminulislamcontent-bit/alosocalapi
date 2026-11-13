// SetupBot Pro — validation engine.
// Two layers (spec Phase 3 + GLOBAL RULES):
//   1. FORMAT check — regex pattern per field (offline, instant)
//   2. LIVE check  — real lightweight API call where possible (8s timeout,
//      max 5 calls/platform/minute, values never logged)
// The live registry covers platforms whose validation endpoints are callable
// without SDKs. Everything else falls back to format + presence checks.

import { getSbPlatform } from './setupbot';

export interface ValidateResult {
  ok: boolean;
  status: 'valid' | 'invalid' | 'error';
  note: string; // Bengali note for the client
}

// ── Rate limiting: max 5 live calls per platform per minute (in-memory) ──
const rateMap = new Map<string, number[]>();
export function rateLimited(platform: string): boolean {
  const now = Date.now();
  const arr = (rateMap.get(platform) ?? []).filter(t => now - t < 60_000);
  if (arr.length >= 5) return true;
  arr.push(now);
  rateMap.set(platform, arr);
  return false;
}

// ── Low-level fetch with timeout; never returns exceptions, only verdicts ──
async function tryFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<{ ok: boolean; code: number | null; body: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    const body = (await res.text().catch(() => '')).slice(0, 500);
    return { ok: res.ok, code: res.status, body };
  } catch {
    return { ok: false, code: null, body: '' };
  } finally {
    clearTimeout(t);
  }
}

type LiveFn = (vals: Record<string, string>) => Promise<ValidateResult>;

/** Live validators keyed by platform key. Values come from saved entries. */
const LIVE: Record<string, LiveFn> = {
  telegram: async (v) => {
    const r = await tryFetch(`https://api.telegram.org/bot${v.bot_token}/getMe`);
    if (r.code === null) return { ok: false, status: 'error', note: 'টেলিগ্রাম সার্ভারে পৌঁছানো যায়নি — নেটওয়ার্ক দেখুন।' };
    if (r.ok && r.body.includes('"ok":true')) return { ok: true, status: 'valid', note: 'বট টোকেন সঠিক — getMe সফল।' };
    return { ok: false, status: 'invalid', note: 'টোকেন ভুল মনে হচ্ছে (401/404) — BotFather থেকে আবার কপি করুন।' };
  },
  discord: async (v) => {
    const r = await tryFetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${v.bot_token}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'ডিসকর্ড সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'বট টোকেন সঠিক — @me সফল।' };
    return { ok: false, status: 'invalid', note: 'বট টোকেন ভুল (401) — Reset Token করে আবার দিন।' };
  },
  slack: async (v) => {
    const r = await tryFetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${v.bot_token}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Slack সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok && r.body.includes('"ok":true')) return { ok: true, status: 'valid', note: 'বট টোকেন সঠিক — auth.test সফল।' };
    return { ok: false, status: 'invalid', note: 'xoxb টোকেন ভুল বা রিভোকড।' };
  },
  notion: async (v) => {
    const r = await tryFetch('https://api.notion.com/v1/users/me', {
      headers: { Authorization: `Bearer ${v.integration_token}`, 'Notion-Version': '2022-06-28' },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Notion সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'ইন্টিগ্রেশন টোকেন সঠিক।' };
    return { ok: false, status: 'invalid', note: 'টোকেন ভুল (401) — নতুন integration বানিয়ে আবার দিন।' };
  },
  stripe: async (v) => {
    const r = await tryFetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${v.secret_key}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Stripe সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok && r.body.includes('"id":"acct_')) return { ok: true, status: 'valid', note: 'সিক্রেট কি সঠিক — অ্যাকাউন্ট পাওয়া গেছে।' };
    return { ok: false, status: 'invalid', note: 'সিক্রেট কি ভুল (401) — dashboard থেকে আবার কপি করুন।' };
  },
  shopify: async (v) => {
    const url = v.store_url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const r = await tryFetch(`https://${url}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': v.admin_token },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'স্টোরে পৌঁছানো যায়নি — store URL ঠিক আছে কি?' };
    if (r.ok && r.body.includes('"shop"')) return { ok: true, status: 'valid', note: 'টোকেন সঠিক — shop.json সফল।' };
    return { ok: false, status: 'invalid', note: 'টোকেন বা স্টোর লিংক ভুল (401/404)।' };
  },
  woocommerce: async (v) => {
    const base = v.store_url.replace(/\/+$/, '');
    const auth = Buffer.from(`${v.consumer_key}:${v.consumer_secret}`).toString('base64');
    const r = await tryFetch(`${base}/wp-json/wc/v3/system_status`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'সাইটে পৌঁছানো যায়নি — URL দেখুন।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'কি/সিক্রেট সঠিক — system_status সফল।' };
    return { ok: false, status: 'invalid', note: 'ck_/cs_ ভুল বা REST API বন্ধ (401)।' };
  },
  hubspot: async (v) => {
    const r = await tryFetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: { Authorization: `Bearer ${v.access_token}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'HubSpot সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'টোকেন সঠিক — contacts রিড সফল।' };
    return { ok: false, status: 'invalid', note: 'pat- টোকেন ভুল (401) — নতুন private app টোকেন নিন।' };
  },
  mailchimp: async (v) => {
    const prefix = v.server_prefix || (v.api_key.split('-')[1] ?? '');
    if (!prefix) return { ok: false, status: 'invalid', note: 'সার্ভার প্রিফিক্স (us21) দিন।' };
    const r = await tryFetch(`https://${prefix}.api.mailchimp.com/3.0/lists?count=1`, {
      headers: { Authorization: `Basic ${Buffer.from(`any:${v.api_key}`).toString('base64')}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Mailchimp সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'API কি সঠিক।' };
    return { ok: false, status: 'invalid', note: 'API কি ভুল (401)।' };
  },
  pinterest: async (v) => {
    const r = await tryFetch('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${v.access_token}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Pinterest সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'টোকেন সঠিক।' };
    return { ok: false, status: 'invalid', note: 'টোকেন ভুল (401)।' };
  },
  linkedin: async (v) => {
    const r = await tryFetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${v.access_token}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'LinkedIn সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'টোকেন সঠিক — /me সফল।' };
    return { ok: false, status: 'invalid', note: 'টোকেন ভুল বা মেয়াদ শেষ (401/403)।' };
  },
  reddit: async (v) => {
    const auth = Buffer.from(`${v.client_id}:${v.client_secret}`).toString('base64');
    const r = await tryFetch('https://www.reddit.com/api/v1/me', {
      headers: { Authorization: `Basic ${auth}`, 'User-Agent': v.user_agent || 'setupbot/2.0' },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Reddit সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok && r.body.includes('"name"')) return { ok: true, status: 'valid', note: 'ক্লায়েন্ট আইডি/সিক্রেট সঠিক।' };
    return { ok: false, status: 'invalid', note: 'অ্যাপ আইডি/সিক্রেট ভুল (401)।' };
  },
  twitch: async (v) => {
    const r = await tryFetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${v.oauth_token}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Twitch সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'অথ টোকেন সঠিক।' };
    return { ok: false, status: 'invalid', note: 'টোকেন ভুল বা মেয়াদ শেষ (401)।' };
  },
  steadfast: async (v) => {
    const auth = Buffer.from(`${v.api_key}:${v.secret_key}`).toString('base64');
    const r = await tryFetch('https://api.steadfast.com.bd/api/v1/profile', {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (r.code === null) return { ok: false, status: 'error', note: 'Steadfast সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok) return { ok: true, status: 'valid', note: 'কি/সিক্রেট সঠিক — প্রোফাইল পাওয়া গেছে।' };
    return { ok: false, status: 'invalid', note: 'কি/সিক্রেট ভুল (401)।' };
  },
  youtube_data: async (v) => {
    const r = await tryFetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(v.channel_id ?? '')}&key=${encodeURIComponent(v.api_key ?? '')}`
    );
    if (r.code === null) return { ok: false, status: 'error', note: 'গুগল সার্ভারে পৌঁছানো যায়নি।' };
    if (r.ok && r.body.includes('"items"')) return { ok: true, status: 'valid', note: 'API কি + চ্যানেল আইডি সঠিক।' };
    if (r.code === 400 || r.code === 403) return { ok: false, status: 'invalid', note: 'API কি ভুল বা YouTube Data API সক্রিয় নয় (400/403)।' };
    return { ok: false, status: 'invalid', note: 'চ্যানেল আইডি ভুল মনে হচ্ছে (404)।' };
  },
  webhook_custom: async (v) => {
    const u = new URL(v.url);
    u.searchParams.set('hub.mode', 'subscribe');
    u.searchParams.set('hub.challenge', 'TEST');
    const r = await tryFetch(u.toString());
    if (r.code === null) return { ok: false, status: 'error', note: 'এন্ডপয়েন্টে পৌঁছানো যায়নি।' };
    if (r.ok && r.body.includes('TEST')) return { ok: true, status: 'valid', note: 'hub.challenge একো — ওয়েবহুক প্রস্তুত।' };
    return { ok: false, status: 'invalid', note: `প্রত্যাশা: 200 + "TEST" রেসপন্স, পাওয়া গেল: ${r.code}` };
  },
};

/** Platforms with a live validator */
export function hasLiveValidator(platform: string): boolean {
  return Boolean(LIVE[platform]);
}

/**
 * Full validation for one platform:
 * 1) format-check every collected field (pattern from template)
 * 2) live-check if a validator exists (unless rate-limited)
 */
export async function validatePlatform(
  platform: string,
  values: Record<string, string>
): Promise<ValidateResult> {
  const tpl = getSbPlatform(platform);
  if (!tpl) return { ok: false, status: 'invalid', note: 'অপরিচিত প্ল্যাটফর্ম।' };

  // 1) format pass
  for (const f of tpl.fields) {
    const val = (values[f.k] ?? '').trim();
    if (!val) continue; // empty → skipped/pending, not a format failure
    if (f.pat && !new RegExp(f.pat).test(val)) {
      return {
        ok: false,
        status: 'invalid',
        note: `${f.bn}: ফরম্যাট ঠিক নেই — ${f.hint ?? 'আবার দেখুন'}`,
      };
    }
  }

  // 2) live pass
  const live = LIVE[platform];
  if (!live) {
    return {
      ok: true,
      status: 'valid',
      note: 'ফরম্যাট সঠিক। (এই প্ল্যাটফর্মের লাইভ যাচাই পরে সার্ভার ক্রনে চলবে)',
    };
  }
  if (rateLimited(platform)) {
    return {
      ok: true,
      status: 'valid',
      note: 'ফরম্যাট সঠিক। (রেট-লিমিট: মিনিটে ৫ বার — লাইভ যাচাই একটু পরে চেষ্টা করুন)',
    };
  }
  return live(values);
}
