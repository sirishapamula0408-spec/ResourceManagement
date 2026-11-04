import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import {
  isCapsLockOn,
  loginErrorMessage,
  MESSAGES,
  retryAfterMinutes,
  signInNotice,
  validateEmail,
  validateLoginForm,
  validatePassword,
} from './loginForm';

describe('sign-in validation', () => {
  it('requires an email in a valid format', () => {
    expect(validateEmail('')).toBe('Enter your work email.');
    expect(validateEmail('   ')).toBe('Enter your work email.');
    expect(validateEmail('priya')).toMatch(/valid email/);
    expect(validateEmail('priya@company')).toMatch(/valid email/);
    expect(validateEmail('pri ya@company.com')).toMatch(/valid email/);
    expect(validateEmail(' priya@company.com ')).toBeUndefined();
  });

  it('requires a password', () => {
    expect(validatePassword('')).toBe('Enter your password.');
    expect(validatePassword(' ')).toBeUndefined();
  });

  it('collects the errors of every field', () => {
    expect(validateLoginForm({ email: '', password: '' })).toEqual({
      email: 'Enter your work email.',
      password: 'Enter your password.',
    });
    expect(validateLoginForm({ email: 'bad', password: 'x' })).toEqual({
      email: expect.stringMatching(/valid email/),
    });
    expect(validateLoginForm({ email: 'a@b.co', password: 'x' })).toEqual({});
  });
});

describe('sign-in error messages', () => {
  it('never says which of email or password was wrong', () => {
    expect(loginErrorMessage(new ApiError(401, 'Invalid credentials'))).toBe(
      'Email or password is incorrect.',
    );
  });

  it('reports a locked account with the time to wait', () => {
    expect(
      loginErrorMessage(
        new ApiError(423, 'Locked', { code: 'ACCOUNT_LOCKED', retryAfterSeconds: 600 }),
      ),
    ).toBe(
      'Your account is locked after too many attempts. Try again in 10 minutes or contact your administrator.',
    );
    expect(loginErrorMessage(new ApiError(423, 'Locked', { retryAfterSeconds: 30 }))).toContain(
      'Try again in 1 minute or',
    );
    // A "locked" flag counts even without the 423 status; no time given means 15 minutes.
    expect(loginErrorMessage(new ApiError(403, 'Locked', { locked: true }))).toContain(
      '15 minutes',
    );
  });

  it('reports a per-network limit separately', () => {
    expect(loginErrorMessage(new ApiError(429, 'Slow down', { retryAfterSeconds: 120 }))).toBe(
      'Too many sign-in attempts from this network. Try again in 2 minutes.',
    );
  });

  it('reports a disabled account', () => {
    expect(loginErrorMessage(new ApiError(403, 'Disabled', { code: 'ACCOUNT_DISABLED' }))).toBe(
      MESSAGES.disabled,
    );
  });

  it('treats network failures and server errors alike', () => {
    expect(loginErrorMessage(new TypeError('Failed to fetch'))).toBe(MESSAGES.unreachable);
    expect(loginErrorMessage(new ApiError(500, 'Internal server error'))).toBe(
      MESSAGES.unreachable,
    );
    expect(loginErrorMessage(new ApiError(502, 'Bad Gateway'))).toBe(MESSAGES.unreachable);
    expect(loginErrorMessage(new ApiError(504, 'Gateway Timeout'))).toBe(MESSAGES.unreachable);
  });

  it('reads the wait time defensively', () => {
    expect(retryAfterMinutes({ retryAfterSeconds: 61 })).toBe(2);
    expect(retryAfterMinutes({ retryAfterSeconds: 'soon' })).toBe(15);
    expect(retryAfterMinutes(undefined)).toBe(15);
  });
});

describe('sign-in notices and hints', () => {
  it('explains an expired session', () => {
    expect(signInNotice('expired')).toBe('Your session expired. Please sign in again.');
    expect(signInNotice(null)).toBeUndefined();
    expect(signInNotice('other')).toBeUndefined();
  });

  it('detects Caps Lock from a keyboard event', () => {
    expect(isCapsLockOn({ getModifierState: (k) => k === 'CapsLock' })).toBe(true);
    expect(isCapsLockOn({ getModifierState: () => false })).toBe(false);
    expect(isCapsLockOn({})).toBe(false);
  });
});
