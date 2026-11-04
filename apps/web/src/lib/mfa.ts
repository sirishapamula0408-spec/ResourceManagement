import { api, type LoginResponse } from './api';

/**
 * Second sign-in step (MFA). The API does not offer MFA yet: when it does, POST /auth/login
 * answers { mfaRequired: true, mfaToken } instead of a session, and the endpoints below finish
 * the sign-in. Until then nothing sends people here.
 */

export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 30;

/** What the sign-in page passes to the MFA page in router state. */
export interface MfaState {
  mfaToken: string;
  next: string | null;
  remember: boolean;
  /** Where the code went, already masked by the API, e.g. "p•••@company.com". */
  destination?: string;
}

/** Sign-in answer when a second step is needed. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  destination?: string;
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
        destination: s.destination,
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

// TODO(MFA): the API has no MFA endpoints yet. Add POST /api/auth/mfa/verify
// ({ mfaToken, code } -> LoginResponse, 401 for a wrong or expired code) and
// POST /api/auth/mfa/resend ({ mfaToken } -> 204, rate-limited). These calls are ready for them.
export const verifyMfaCode = (mfaToken: string, code: string) =>
  api<LoginResponse>('/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify({ mfaToken, code }),
  });

export const resendMfaCode = (mfaToken: string) =>
  api<void>('/auth/mfa/resend', { method: 'POST', body: JSON.stringify({ mfaToken }) });
