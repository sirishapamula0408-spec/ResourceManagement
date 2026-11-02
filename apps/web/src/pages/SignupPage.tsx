import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { Field } from '../components/Dialog';
import { api, auth, type LoginResponse, safeNext } from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';

/** Self sign-up for company email domains (SIGNUP_DOMAINS on the API); new people are team members. */
export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [mismatch, setMismatch] = useState(false);

  const { data: signup, isLoading } = useQuery({
    queryKey: ['signup-domains'],
    queryFn: () => api<{ domains: string[] }>('/auth/signup'),
  });
  const domains = signup?.domains ?? [];

  const create = useMutation({
    mutationFn: () =>
      api<LoginResponse>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      }),
    onSuccess: (data) => {
      auth.setToken(data.token);
      queryClient.clear();
      navigate(safeNext(next), { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const differs = form.password !== form.confirm;
    setMismatch(differs);
    if (!differs) create.mutate();
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const signInLink = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  if (!isLoading && !domains.length) {
    return (
      <AuthCard title="Sign-up isn’t available">
        <p className="mb-4 text-muted">Ask an admin to add you to Resource Board.</p>
        <Link to={signInLink} className="text-teal underline">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  const emailHint = domains.map((d) => `@${d}`).join(' or ');
  return (
    <AuthCard
      title="Create your account"
      intro={`Use your company email address (${emailHint}). Use at least 8 characters for the password, including a letter and a number.`}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Full name">
          <input
            autoComplete="name"
            className={inputClass}
            value={form.name}
            required
            autoFocus
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label="Work email">
          <input
            type="email"
            autoComplete="username"
            className={inputClass}
            value={form.email}
            required
            placeholder={domains[0] ? `name@${domains[0]}` : undefined}
            onChange={(e) => set({ email: e.target.value })}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            className={inputClass}
            value={form.password}
            required
            onChange={(e) => set({ password: e.target.value })}
          />
        </Field>
        <Field label="Confirm password">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={form.confirm}
            required
            onChange={(e) => set({ confirm: e.target.value })}
          />
        </Field>
        {(mismatch || create.error) && (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
            {mismatch ? 'The passwords don’t match.' : errorMessage(create.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className={`${buttonClass('primary')} mt-1`}
        >
          {create.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-muted">
        Already have an account?{' '}
        <Link to={signInLink} className="text-teal underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
