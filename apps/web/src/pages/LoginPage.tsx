import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { Field } from '../components/Dialog';
import { api, ApiError, auth, type Role } from '../lib/api';
import { buttonClass, inputClass } from '../lib/forms';

interface LoginResponse {
  token: string;
  user: { id: string; name: string; email: string; role: Role; mustChangePassword: boolean };
}

/** Only return to pages inside this app after signing in. */
const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login')
    ? next
    : '/dashboard';

/** Email/password sign-in. TODO(M3): "Sign in with Microsoft" (Azure AD SSO). */
export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () =>
      api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      auth.setToken(data.token);
      // Start clean: nothing cached from a previous user (or from before sign-in).
      queryClient.clear();
      navigate(data.user.mustChangePassword ? '/account/password' : safeNext(params.get('next')), {
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
    <AuthCard
      title="Sign in"
      intro={params.get('next') ? 'Sign in to continue to that page.' : undefined}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Email">
          <input
            type="email"
            autoComplete="username"
            className={inputClass}
            value={email}
            required
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            className={inputClass}
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={login.isPending}
          className={`${buttonClass('primary')} mt-1`}
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  );
}
