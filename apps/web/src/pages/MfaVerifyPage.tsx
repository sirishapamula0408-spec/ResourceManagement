import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { focusRing, SignInCard, SignInShell, TrustBadges } from '../components/SignInShell';
import { ApiError, auth, safeNext } from '../lib/api';
import { loginErrorMessage } from '../lib/loginForm';
import {
  CODE_LENGTH,
  enterDigits,
  isComplete,
  readMfaState,
  RESEND_COOLDOWN_SECONDS,
  resendMfaCode,
  verifyMfaCode,
} from '../lib/mfa';

const empty = () => Array<string>(CODE_LENGTH).fill('');

function mfaErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return 'That code is incorrect or has expired. Try again, or resend the code.';
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'Two-step verification isn’t available yet. Contact your administrator.';
  }
  return loginErrorMessage(error);
}

/**
 * Second sign-in step: a 6-digit code (boxes advance as you type, and a pasted code fills them
 * all), "Resend code" with a 30-second cooldown and "Use a different method". Reached from the
 * sign-in page when the API asks for MFA; opened directly, it goes back to sign-in.
 */
export function MfaVerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mfa = readMfaState(location.state);
  const [digits, setDigits] = useState(empty);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [otherMethod, setOtherMethod] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verify = useMutation({
    mutationFn: (code: string) => verifyMfaCode(mfa!.mfaToken, code),
    onSuccess: (data) => {
      auth.setToken(data.token, mfa!.remember);
      queryClient.clear();
      navigate(data.user.mustChangePassword ? '/account/password' : safeNext(mfa!.next), {
        replace: true,
      });
    },
    onError: () => setDigits(empty()),
  });
  const resend = useMutation({
    mutationFn: () => resendMfaCode(mfa!.mfaToken),
    onMutate: () => setCooldown(RESEND_COOLDOWN_SECONDS),
  });
  const error = verify.error ?? resend.error;

  useEffect(() => {
    if (error) bannerRef.current?.focus();
  }, [error]);

  if (!mfa) return <Navigate to="/login" replace />;

  function submit(code: string) {
    if (!verify.isPending) verify.mutate(code);
  }

  function onInput(index: number, text: string) {
    if (!text) {
      setDigits((d) => d.map((v, i) => (i === index ? '' : v)));
      return;
    }
    const result = enterDigits(digits, index, text);
    setDigits(result.digits);
    boxes.current[result.focus]?.focus();
    if (isComplete(result.digits)) submit(result.digits.join(''));
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault();
      setDigits((d) => d.map((v, i) => (i === index - 1 ? '' : v)));
      boxes.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      boxes.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      e.preventDefault();
      boxes.current[index + 1]?.focus();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isComplete(digits)) submit(digits.join(''));
    else boxes.current[digits.findIndex((d) => !d)]?.focus();
  }

  const link = `rounded font-medium text-[#1546d6] hover:underline disabled:text-[#5b6785] disabled:no-underline ${focusRing}`;

  return (
    <SignInShell>
      <SignInCard>
        <h1 className="text-[1.55rem] font-bold text-[#0b1f5c]">Verify it’s you</h1>
        <p className="mb-[clamp(0.75rem,2vh,1.25rem)] text-[13px] text-[#3b4867]">
          Enter the 6-digit code we sent to {mfa.destination ?? 'you'}.
        </p>

        {error && (
          <div
            ref={bannerRef}
            role="alert"
            tabIndex={-1}
            className="mb-3 rounded-md border border-[#f1b8b4] bg-[#fdeceb] px-3 py-2 text-sm text-[#9f1c14]"
          >
            {mfaErrorMessage(error)}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate aria-busy={verify.isPending}>
          <fieldset>
            <legend className="mb-1 block text-[13px] font-medium text-[#1f2b4d]">
              Verification code
            </legend>
            <div className="flex justify-between gap-2">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  value={digit}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  autoFocus={i === 0}
                  aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                  disabled={verify.isPending}
                  className="h-[clamp(2.75rem,6vh,3.25rem)] w-full min-w-0 rounded-md border border-[#cfd6e4] bg-white text-center text-xl font-semibold text-[#0b1f5c] outline-none focus:border-[#1546d6] focus:ring-2 focus:ring-[#1546d6]/15"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => onInput(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onPaste={(e) => {
                    e.preventDefault();
                    onInput(i, e.clipboardData.getData('text'));
                  }}
                />
              ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={verify.isPending}
            className={`mt-[clamp(0.875rem,2.2vh,1.25rem)] flex h-[clamp(2.5rem,5.2vh,3rem)] w-full items-center justify-center gap-2 rounded-md bg-[#0f3bcf] text-[15px] font-semibold text-white shadow-sm hover:bg-[#0b31b0] disabled:cursor-wait disabled:opacity-80 ${focusRing}`}
          >
            {verify.isPending ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <div className="mt-[clamp(0.75rem,2vh,1.25rem)] flex items-center justify-between text-[13px]">
          <button
            type="button"
            className={link}
            disabled={cooldown > 0 || resend.isPending}
            onClick={() => resend.mutate()}
          >
            {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
          </button>
          <button
            type="button"
            className={link}
            aria-expanded={otherMethod}
            onClick={() => setOtherMethod((o) => !o)}
          >
            Use a different method
          </button>
        </div>
        <p role="status" className="sr-only">
          {resend.isSuccess ? 'A new code is on its way.' : ''}
        </p>
        {otherMethod && (
          <p className="mt-3 rounded-md bg-[#eef3ff] px-3 py-2 text-sm text-[#1f2b4d]">
            No other sign-in methods are set up for your account. Contact your administrator, or{' '}
            <Link
              to="/login"
              className={`rounded font-medium text-[#1546d6] hover:underline ${focusRing}`}
            >
              go back to sign in
            </Link>
            .
          </p>
        )}

        <TrustBadges />
      </SignInCard>
    </SignInShell>
  );
}
