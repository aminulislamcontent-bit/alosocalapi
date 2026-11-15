// Offline-only credential format checks. This module deliberately performs no
// outbound provider request and therefore cannot claim authorization or validity.
import { getSbPlatform } from './setupbot';

export interface ValidateResult {
  ok: boolean;
  status: 'format_only' | 'invalid' | 'error';
  note: string;
}

export async function validatePlatform(platform: string, values: Record<string, string>): Promise<ValidateResult> {
  const template = getSbPlatform(platform);
  if (!template) return { ok: false, status: 'error', note: 'Unknown provider template.' };
  const supplied = template.fields.filter(field => Boolean(values[field.k]?.trim()));
  if (supplied.length === 0) {
    return { ok: false, status: 'error', note: 'কোনো সংরক্ষিত মান পাওয়া যায়নি।' };
  }

  const invalid = supplied.filter(field => {
    if (!field.pat) return false;
    try { return !new RegExp(field.pat).test(values[field.k].trim()); }
    catch { return true; }
  });
  if (invalid.length > 0) {
    return {
      ok: false,
      status: 'invalid',
      note: `ফরম্যাট মিলেনি: ${invalid.map(field => field.label).join(', ')}। এটি কেবল লোকাল ফরম্যাট পরীক্ষা; কোনো অ্যাকাউন্টে লগইন বা API কল হয়নি।`,
    };
  }
  return {
    ok: true,
    status: 'format_only',
    note: 'লোকাল উপস্থিতি/ফরম্যাট পরীক্ষা পাস করেছে। এটি provider authorization, token validity বা account access যাচাই করে না; কোনো বাহ্যিক API কল হয়নি।',
  };
}
