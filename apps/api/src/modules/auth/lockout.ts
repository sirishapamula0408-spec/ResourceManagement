/**
 * Account lockout after repeated failed sign-ins: 5 failures within 15 minutes lock the email
 * address for 15 minutes. A successful sign-in clears the count. Keyed by the email that was
 * typed, so unknown addresses lock exactly like real ones (nothing to learn from the response).
 *
 * Kept in memory: correct for the single API instance this app runs as today, and cleared by a
 * restart. Running several instances needs a shared store (Redis or a DB table) instead.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  firstAt: number;
  lockedUntil?: number;
}

const entries = new Map<string, Entry>();

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** Forget entries whose window and lock are both over (keeps the map small). */
function prune(now: number) {
  for (const [key, e] of entries) {
    if (now - e.firstAt > WINDOW_MS && (e.lockedUntil ?? 0) <= now) entries.delete(key);
  }
}

/** Seconds until this account may try again, or 0 if it is not locked. */
export function lockedFor(key: string, now = Date.now()): number {
  const until = entries.get(key)?.lockedUntil;
  return until && until > now ? seconds(until - now) : 0;
}

/** Count a failed attempt; the fifth inside the window locks the account. */
export function recordFailure(
  key: string,
  now = Date.now(),
): { locked: boolean; retryAfterSeconds: number } {
  if (entries.size > 10_000) prune(now);
  let e = entries.get(key);
  if (!e || now - e.firstAt > WINDOW_MS || (e.lockedUntil && e.lockedUntil <= now)) {
    e = { failures: 0, firstAt: now };
    entries.set(key, e);
  }
  e.failures += 1;
  if (e.failures >= MAX_FAILURES) {
    e.lockedUntil = now + LOCK_MS;
    return { locked: true, retryAfterSeconds: seconds(LOCK_MS) };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

export function clearFailures(key: string) {
  entries.delete(key);
}
