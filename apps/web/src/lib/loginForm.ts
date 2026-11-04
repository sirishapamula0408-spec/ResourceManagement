import { ApiError } from './api';

/** Validation, error messages and notices for the sign-in form (kept pure so they are testable). */

export type LoginField = 'email' | 'password';
export type LoginErrors = Partial<Record<LoginField, string>>;

// Deliberately loose: something@something.tld, no spaces. The API checks the address properly.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your work email.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@company.com.';
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  return value ? undefined : 'Enter your password.';
}

/** Errors for every field that is not valid; an empty object means the form can be sent. */
export function validateLoginForm(values: { email: string; password: string }): LoginErrors {
  const errors: LoginErrors = {};
  const email = validateEmail(values.email);
  const password = validatePassword(values.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  return errors;
}

export const MESSAGES = {
  invalid: 'Email or password is incorrect.',
  disabled: 'This account is disabled. Contact your administrator.',
  unreachable: 'We couldn’t reach the server. Check your connection and try again.',
  expired: 'Your session expired. Please sign in again.',
} as const;

const minutes = (n: number) => `${n} minute${n === 1 ? '' : 's'}`;

/** Whole minutes to wait, from the API's `details.retryAfterSeconds` (15 if it is missing). */
export function retryAfterMinutes(details: unknown): number {
  const seconds = (details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? Math.ceil(seconds / 60) : 15;
}

/**
 * What to tell the person when sign-in fails. Never says whether the email or the password was
 * wrong; a locked or disabled account is only reported by the API after a correct password.
 */
export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return MESSAGES.unreachable; // fetch itself failed
  const details = error.details as { code?: unknown; locked?: unknown } | undefined;
  if (error.status === 423 || details?.code === 'ACCOUNT_LOCKED' || details?.locked === true) {
    return `Your account is locked after too many attempts. Try again in ${minutes(retryAfterMinutes(error.details))} or contact your administrator.`;
  }
  if (error.status === 429) {
    return `Too many sign-in attempts from this network. Try again in ${minutes(retryAfterMinutes(error.details))}.`;
  }
  if (error.status === 401) return MESSAGES.invalid;
  if (error.status === 403 && details?.code === 'ACCOUNT_DISABLED') return MESSAGES.disabled;
  if (error.status >= 500 || error.status === 0) return MESSAGES.unreachable;
  if (error.status === 400) return 'Check your email and password, then try again.';
  return error.message || MESSAGES.unreachable;
}

/** Info shown above the form when the page was opened for a reason, e.g. `?reason=expired`. */
export function signInNotice(reason: string | null): string | undefined {
  return reason === 'expired' ? MESSAGES.expired : undefined;
}

/** Whether Caps Lock is on, from a keyboard event (false when the browser can't tell). */
export function isCapsLockOn(event: { getModifierState?: (key: 'CapsLock') => boolean }): boolean {
  return typeof event.getModifierState === 'function' && event.getModifierState('CapsLock');
}
