import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { focusRing, SignInCard, SignInShell, TrustBadges } from '../components/SignInShell';
import { api, auth, type LoginResponse, safeNext } from '../lib/api';
import { appConfig } from '../lib/appConfig';
import {
  isCapsLockOn,
  type LoginField,
  loginErrorMessage,
  signInNotice,
  validateLoginForm,
  visibleError,
} from '../lib/loginForm';
import { type MfaChallenge, type MfaState, needsMfa } from '../lib/mfa';

// An errored field keeps its red border when focused and gets a solid blue ring outside it, so
// keyboard users always see where focus is.
const fieldBox = (invalid: boolean) =>
  `flex h-[clamp(2.5rem,5.2vh,3rem)] items-center gap-3 rounded-md border bg-white px-3.5 text-[#1f2b4d] focus-within:ring-2 ${
    invalid
      ? 'border-error focus-within:border-error focus-within:ring-[#1546d6]'
      : 'border-[#cfd6e4] focus-within:border-[#1546d6] focus-within:ring-[#1546d6]/15'
  }`;
const svg = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** The four-square Microsoft logo for the SSO button. */
function MicrosoftLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect width="10" height="10" fill="#f25022" />
      <rect x="12" width="10" height="10" fill="#7fba00" />
      <rect y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

/**
 * A visible label, the input box with its leading icon, and one line under it for the field's
 * error (or else a hint). The line always takes its height, so the card doesn't jump when an
 * error comes or goes.
 */
function Field({
  id,
  label,
  icon,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-[#1f2b4d]">
        {label}
      </label>
      <div className={fieldBox(!!error)}>
        <span className={error ? 'text-error' : 'text-[#5b6785]'}>{icon}</span>
        {children}
      </div>
      <p
        id={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`mt-1 min-h-4 text-xs leading-4 ${error ? 'text-error' : 'font-medium text-[#8a4b00]'}`}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

const describedBy = (...ids: (string | false | undefined)[]) =>
  ids.filter(Boolean).join(' ') || undefined;

/**
 * Sign in with email and password, in the SedHub design. "Remember me" keeps the session in this
 * browser; without it (the default) the session ends when the browser closes. Field errors show
 * once a field has lost focus or the form was submitted, never on first render; server errors show in a banner that takes focus. Microsoft
 * sign-in shows only when VITE_SSO_ENABLED is on. There is no self-registration link: people ask
 * their administrator (VITE_ADMIN_EMAIL) for access.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [values, setValues] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState<Record<LoginField, boolean>>({
    email: false,
    password: false,
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [remember, setRemember] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const next = params.get('next');
  const notice = signInNotice(params.get('reason'));

  const errors = validateLoginForm(values);
  const shown = (f: LoginField) => visibleError(f, values[f], touched[f], submitAttempted);

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api<LoginResponse | MfaChallenge>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      // A second step is needed: the MFA page finishes the sign-in.
      if (needsMfa(data)) {
        const state: MfaState = {
          mfaToken: data.mfaToken,
          next,
          remember,
        };
        navigate('/login/mfa', { state });
        return;
      }
      auth.setToken(data.token, remember);
      // Start clean: nothing cached from a previous user (or from before sign-in).
      queryClient.clear();
      navigate(data.user.mustChangePassword ? '/account/password' : safeNext(next), {
        replace: true,
      });
    },
  });
  const serverError = login.error ? loginErrorMessage(login.error) : undefined;

  // Screen readers and keyboard users land on the problem straight away.
  useEffect(() => {
    if (login.error) bannerRef.current?.focus();
  }, [login.error]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (login.isPending) return; // no double submit (the button is disabled too)
    setSubmitAttempted(true);
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();
    login.mutate({ email: values.email.trim(), password: values.password });
  }

  const set = (f: LoginField) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [f]: e.target.value }));
  const touch = (f: LoginField) => () => setTouched((t) => ({ ...t, [f]: true }));

  return (
    <SignInShell>
      <SignInCard>
        <h1 className="text-[1.55rem] font-bold text-[#0b1f5c]">Sign in</h1>
        <p className="mb-[clamp(0.75rem,2vh,1.25rem)] text-[13px] text-[#3b4867]">
          Access your workspace
        </p>

        {serverError ? (
          <div
            ref={bannerRef}
            role="alert"
            tabIndex={-1}
            className="mb-3 rounded-md border border-error/30 bg-error-bg px-3 py-2 text-sm text-error"
          >
            {serverError}
          </div>
        ) : (
          notice && (
            <div
              role="status"
              className="mb-3 rounded-md border border-[#c9d7fb] bg-[#eef3ff] px-3 py-2 text-sm text-[#1f2b4d]"
            >
              {notice}
            </div>
          )
        )}

        <form
          onSubmit={onSubmit}
          noValidate
          aria-busy={login.isPending}
          className="flex flex-col gap-[clamp(0.625rem,1.6vh,1rem)]"
        >
          <Field
            id="login-email"
            label="Work email"
            error={shown('email')}
            icon={
              <svg {...svg}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            }
          >
            <input
              ref={emailRef}
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@company.com"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#5b6785]"
              value={values.email}
              required
              aria-required="true"
              aria-invalid={!!shown('email')}
              aria-describedby={describedBy(shown('email') && 'login-email-error')}
              autoFocus
              onChange={set('email')}
              onBlur={touch('email')}
            />
          </Field>

          <Field
            id="login-password"
            label="Password"
            error={shown('password')}
            icon={
              <svg {...svg}>
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            }
            hint={capsLock ? 'Caps Lock is on' : undefined}
          >
            <input
              ref={passwordRef}
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#5b6785]"
              value={values.password}
              required
              aria-required="true"
              aria-invalid={!!shown('password')}
              aria-describedby={describedBy(
                shown('password') && 'login-password-error',
                !shown('password') && capsLock && 'login-password-hint',
              )}
              onChange={set('password')}
              onKeyDown={(e) => setCapsLock(isCapsLockOn(e))}
              onKeyUp={(e) => setCapsLock(isCapsLockOn(e))}
              onBlur={() => {
                touch('password')();
                setCapsLock(false);
              }}
            />
            <button
              type="button"
              className={`rounded text-[#3b4867] hover:text-[#1546d6] ${focusRing}`}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-controls="login-password"
              title={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? (
                <svg {...svg}>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg {...svg}>
                  <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              )}
            </button>
          </Field>

          <div className="flex items-center justify-between text-[13px]">
            <label className="flex items-center gap-2.5 text-[#1f2b4d]">
              <input
                type="checkbox"
                name="remember"
                className={`h-4 w-4 accent-[#1546d6] ${focusRing}`}
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <Link
              to={next ? `/forgot-password?next=${encodeURIComponent(next)}` : '/forgot-password'}
              className={`rounded font-medium text-[#1546d6] hover:underline ${focusRing}`}
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className={`mt-1 flex h-[clamp(2.5rem,5.2vh,3rem)] items-center justify-center gap-2 rounded-md bg-[#0f3bcf] text-[15px] font-semibold text-white shadow-sm hover:bg-[#0b31b0] disabled:cursor-wait disabled:opacity-80 ${focusRing}`}
          >
            {login.isPending && (
              <svg
                className="size-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeOpacity=".3"
                  strokeWidth="3"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {appConfig.ssoEnabled && (
          <>
            <div
              className="my-[clamp(0.625rem,2vh,1.25rem)] flex items-center gap-4 text-[13px] text-[#5b6785]"
              aria-hidden="true"
            >
              <span className="h-px flex-1 bg-[#d8deea]" />
              or
              <span className="h-px flex-1 bg-[#d8deea]" />
            </div>
            {/* TODO(M3): the API has no Azure AD (OIDC) sign-in yet; this is where it starts. */}
            <a
              href="/api/auth/sso/microsoft"
              className={`flex h-[clamp(2.5rem,5.2vh,3rem)] w-full items-center justify-center gap-3 rounded-md border border-[#b9c2d6] bg-white text-[15px] font-medium text-[#1f2b4d] hover:bg-[#f4f6fb] ${focusRing}`}
            >
              <MicrosoftLogo />
              Sign in with Microsoft (SSO)
            </a>
          </>
        )}

        {/* With no VITE_ADMIN_EMAIL there is no address to link to: the text stays plain. */}
        <p className="mt-[clamp(0.75rem,2vh,1.25rem)] text-center text-[13px] text-[#1f2b4d]">
          <span className="text-[#5b6785]">Need access?</span>{' '}
          {appConfig.adminEmail ? (
            <a
              href={`mailto:${appConfig.adminEmail}`}
              className={`rounded font-medium text-[#1546d6] hover:underline focus-visible:underline ${focusRing}`}
            >
              Contact your administrator
            </a>
          ) : (
            'Contact your administrator'
          )}
        </p>

        <TrustBadges />
      </SignInCard>
    </SignInShell>
  );
}
