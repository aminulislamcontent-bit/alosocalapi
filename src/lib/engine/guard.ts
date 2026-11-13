import { getSessionUser, type SessionUser } from '@/lib/auth';

// ─── Engine auth guard: tenant isolation from the session (§11) ─────

export interface EngineScope {
  user: SessionUser;
  /** null = admin acting globally; string = forced tenant scope */
  clientId: string | null;
  isGlobal: boolean;
}

export async function requireEngineScope(requestedClientId?: string | null): Promise<
  { ok: true; scope: EngineScope } | { ok: false; status: number; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: 'অননুমোদিত — লগইন করুন।' };

  if (user.role === 'admin') {
    return { ok: true, scope: { user, clientId: requestedClientId ?? null, isGlobal: true } };
  }

  // Clients are always hard-scoped to their own workspace
  if (!user.clientId) return { ok: false, status: 403, error: 'ক্লায়েন্ট স্কোপ পাওয়া যায়নি।' };
  if (user.status && !['active', 'completed'].includes(user.status)) {
    return { ok: false, status: 403, error: 'একাউন্ট লক করা আছে।' };
  }
  if (requestedClientId && requestedClientId !== user.clientId) {
    return { ok: false, status: 403, error: 'টেন্যান্ট আইসোলেশন: অন্য ক্লায়েন্টের ডেটা দেখার অনুমতি নেই।' };
  }
  return { ok: true, scope: { user, clientId: user.clientId, isGlobal: false } };
}
