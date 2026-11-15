import { createHash } from 'node:crypto';
import { db } from '@/lib/db';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const LOGIN_FAILURE_LIMIT = 5;

export function loginThrottleKey(role: 'admin' | 'client', username: string): string {
  // Store neither the identifier nor the attempted password in the throttle table.
  return createHash('sha256').update(`${role}\0${username.trim().toLowerCase()}`).digest('hex');
}

export interface ThrottleState {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number | null;
}

export function isThrottleLocked(state: ThrottleState | null, now = Date.now()): boolean {
  return Boolean(state?.lockedUntil && state.lockedUntil > now);
}

export function nextThrottleState(state: ThrottleState | null, now = Date.now()): ThrottleState {
  if (!state || now - state.windowStartedAt >= LOGIN_WINDOW_MS) {
    return { failures: 1, windowStartedAt: now, lockedUntil: null };
  }
  const failures = state.failures + 1;
  return {
    failures,
    windowStartedAt: state.windowStartedAt,
    lockedUntil: failures >= LOGIN_FAILURE_LIMIT ? now + LOGIN_LOCK_MS : null,
  };
}

export async function loginIsLocked(key: string, now = new Date()): Promise<boolean> {
  const row = await db.loginThrottle.findUnique({ where: { key } });
  if (!row) return false;
  if (row.lockedUntil && row.lockedUntil > now) return true;
  if (now.getTime() - row.windowStartedAt.getTime() >= LOGIN_WINDOW_MS) {
    await db.loginThrottle.delete({ where: { key } }).catch(() => undefined);
  }
  return false;
}

export async function recordLoginFailure(key: string, now = new Date()): Promise<void> {
  const previous = await db.loginThrottle.findUnique({ where: { key } });
  const state = nextThrottleState(previous ? {
    failures: previous.failures,
    windowStartedAt: previous.windowStartedAt.getTime(),
    lockedUntil: previous.lockedUntil?.getTime() ?? null,
  } : null, now.getTime());
  await db.loginThrottle.upsert({
    where: { key },
    create: {
      key,
      failures: state.failures,
      windowStartedAt: new Date(state.windowStartedAt),
      lockedUntil: state.lockedUntil ? new Date(state.lockedUntil) : null,
    },
    update: {
      failures: state.failures,
      windowStartedAt: new Date(state.windowStartedAt),
      lockedUntil: state.lockedUntil ? new Date(state.lockedUntil) : null,
    },
  });
}

export async function clearLoginFailures(key: string): Promise<void> {
  await db.loginThrottle.delete({ where: { key } }).catch(() => undefined);
}
