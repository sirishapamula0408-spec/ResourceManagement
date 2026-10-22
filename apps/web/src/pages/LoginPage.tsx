import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../lib/api';

interface LoginResponse {
  token: string;
  user: { id: string; name: string; email: string; role: string };
}

/** Email/password sign-in stub. TODO(M3): "Sign in with Microsoft" (Azure AD SSO). */
export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@resourceboard.local');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () =>
      api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      auth.setToken(data.token);
      navigate('/dashboard');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={onSubmit}
        className="w-80 rounded-lg border border-line bg-panel p-6 shadow-sm"
      >
        <h1 className="mb-4 text-xl font-semibold">Sign in to Resource Board</h1>
        <label className="mb-1 block text-sm text-muted" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="mb-3 w-full rounded border border-line px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="mb-1 block text-sm text-muted" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="mb-4 w-full rounded border border-line px-3 py-2 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {login.error && <p className="mb-3 text-sm text-red">{login.error.message}</p>}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-teal px-3 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-50"
        >
          {login.isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
