import { api, type LoginResponse } from './api';

/**
 * Second sign-in step (MFA) with an authenticator app such as Microsoft Authenticator. For
 * people who have turned it on, POST /auth/login answers { mfaRequired: true, mfaToken }
 * instead of a session, and POST /auth/mfa/verify finishes the sign-in with the app's code.
 */

export const CODE_LENGTH = 6;

/** What the sign-in page passes to the MFA page in router state. */
export interface MfaState {
  mfaToken: string;
  next: string | null;
  remember: boolean;
}

/** Sign-in answer when a second step is needed. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export const needsMfa = (res: LoginResponse | MfaChallenge): res is MfaChallenge =>
  'mfaRequired' in res && res.mfaRequired === true;

/** Router state from the sign-in page, or null if the page was opened directly. */
export function readMfaState(state: unknown): MfaState | null {
  const s = state as Partial<MfaState> | null;
  return s && typeof s.mfaToken === 'string' && s.mfaToken
    ? {
        mfaToken: s.mfaToken,
        next: s.next ?? null,
        remember: !!s.remember,
      }
    : null;
}

/**
 * Put typed or pasted text into the code boxes from `index` on: digits only, extra ones beyond
 * the last box dropped. Returns the new digits and the box to focus next.
 */
export function enterDigits(
  digits: string[],
  index: number,
  text: string,
): { digits: string[]; focus: number } {
  const typed = text.replace(/\D/g, '').split('');
  if (!typed.length) return { digits, focus: index };
  const out = [...digits];
  let i = index;
  for (const d of typed) {
    if (i >= CODE_LENGTH) break;
    out[i++] = d;
  }
  return { digits: out, focus: Math.min(i, CODE_LENGTH - 1) };
}

export const isComplete = (digits: string[]) =>
  digits.length === CODE_LENGTH && digits.every((d) => /^\d$/.test(d));

/** 401 for a wrong, reused or expired code (or an expired sign-in), 423 after too many. */
export const verifyMfaCode = (mfaToken: string, code: string) =>
  api<LoginResponse>('/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ mfaToken, code }),
  });

/** Setting it up on your account (Account page). */
export interface MfaSetup {
  /** The key in groups of four, for typing into the app instead of scanning. */
  secret: string;
  account: string;
  issuer: string;
  otpauthUrl: string;
  /** QR code of otpauthUrl, as SVG markup from the API. */
  qrSvg: string;
}

export const mfaStatus = () => api<{ enabled: boolean }>('/auth/mfa');
export const startMfaSetup = () => api<MfaSetup>('/auth/mfa/setup', { method: 'POST' });
export const enableMfa = (code: string) =>
  api<void>('/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) });
export const disableMfa = (password: string) =>
  api<void>('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password }) });
