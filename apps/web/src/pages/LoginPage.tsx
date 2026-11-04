import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SedHubMark, SignInShell } from '../components/SignInShell';
import { api, ApiError, auth, type LoginResponse, safeNext } from '../lib/api';

const field =
  'flex h-12 items-center gap-3 rounded-md border border-[#cfd6e4] bg-white px-3.5 text-[#1f2b4d] focus-within:border-[#1546d6] focus-within:ring-2 focus-within:ring-[#1546d6]/15';
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
 * Sign in with email and password, in the SedHub design. "Remember me" keeps the session in this
 * browser; without it the session ends when the browser closes. Microsoft sign-in (M3) and a
 * self-service password reset are not built yet, so those controls say so instead of failing.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [forgot, setForgot] = useState(false);
  // Sign-up is offered only when the server allows some email domains.
  const { data: signup } = useQuery({
    queryKey: ['signup-domains'],
    queryFn: () => api<{ domains: string[] }>('/auth/signup'),
  });
  const next = params.get('next');

  const login = useMutation({
    mutationFn: () =>
      api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      auth.setToken(data.token, remember);
      // Start clean: nothing cached from a previous user (or from before sign-in).
      queryClient.clear();
      navigate(data.user.mustChangePassword ? '/account/password' : safeNext(next), {
        replace: true,
      });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate();
  }

  const error =
    login.error instanceof ApiError && login.error.status === 401
      ? 'That email and password don’t match an active account.'
      : login.error?.message;

  return (
    <SignInShell>
      <section className="mx-auto w-full max-w-[520px] rounded-2xl bg-white px-8 py-9 shadow-[0_12px_40px_rgba(16,34,94,0.10)] sm:px-14">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3">
            <SedHubMark size={56} />
            <span className="text-[2.6rem] leading-none font-bold tracking-tight text-[#0b1f5c]">
              SedHub
            </span>
          </div>
          <p className="mt-2 text-[15px] font-medium text-[#1f2b4d]">
            Enterprise Project &amp; Resource Management
          </p>
        </div>

        <h1 className="text-[1.9rem] font-bold text-[#0b1f5c]">Sign In</h1>
        <p className="mb-5 text-[#3b4867]">
          {next ? 'Sign in to continue to that page.' : 'Access your workspace'}
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className={field}>
            <span className="text-[#5b6785]">
              <svg {...svg}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </span>
            <span className="sr-only">Email</span>
            <input
              type="email"
              autoComplete="username"
              placeholder="Email"
              className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#5b6785]"
              value={email}
              required
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className={field}>
            <span className="text-[#5b6785]">
              <svg {...svg}>
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            <label className="flex h-full flex-1">
              <span className="sr-only">Password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Password"
                className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#5b6785]"
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="text-[#3b4867] hover:text-[#1546d6]"
              aria-label="Show characters"
              aria-pressed={showPassword}
              title={showPassword ? 'Hide' : 'Show'}
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
          </div>

          <div className="flex items-center justify-between text-[15px]">
            <label className="flex items-center gap-2.5 text-[#1f2b4d]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1546d6]"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <button
              type="button"
              className="font-medium text-[#1546d6] hover:underline"
              aria-expanded={forgot}
              onClick={() => setForgot((f) => !f)}
            >
              Forgot Password?
            </button>
          </div>
          {forgot && (
            <p role="status" className="rounded-md bg-[#eef3ff] px-3 py-2 text-sm text-[#1f2b4d]">
              Ask your administrator to reset it. You will choose a new password the next time you
              sign in.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-sm text-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="mt-1 h-12 rounded-md bg-[#0f3bcf] text-[17px] font-semibold text-white shadow-sm hover:bg-[#0b31b0] disabled:opacity-70"
          >
            {login.isPending ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-4 text-[#5b6785]" aria-hidden="true">
          <span className="h-px flex-1 bg-[#d8deea]" />
          or
          <span className="h-px flex-1 bg-[#d8deea]" />
        </div>
        <button
          type="button"
          disabled
          title="Microsoft sign-in is coming soon"
          className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-md border border-[#b9c2d6] bg-white text-[17px] font-medium text-[#1f2b4d] opacity-70"
        >
          <MicrosoftLogo />
          Sign in with Microsoft (SSO)
        </button>
        <p className="mt-2 text-center text-xs text-[#5b6785]">Microsoft sign-in is coming soon.</p>

        {!!signup?.domains.length && (
          <p className="mt-5 text-center text-[15px] text-[#3b4867]">
            New here?{' '}
            <Link
              to={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
              className="font-medium text-[#1546d6] hover:underline"
            >
              Create an account
            </Link>
          </p>
        )}
      </section>
    </SignInShell>
  );
}
