import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { Field } from '../components/Dialog';
import { api } from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';

// Same rule as the API: 8+ characters with a letter and a number.
const PASSWORD_PATTERN = '(?=.*[A-Za-z])(?=.*[0-9]).{8,}';

/**
 * The link in an invitation email (/invite/:token). The person chooses their password, which
 * accepts the invitation, then signs in on the sign-in page with their email filled in.
 */
export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [mismatch, setMismatch] = useState(false);

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () =>
      api<{ name: string; email: string }>(`/auth/invite/${encodeURIComponent(token)}`),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      api<{ email: string }>('/auth/invite/accept', {
        method: 'POST',
        body: JSON.stringify({ token, password: form.password }),
      }),
    onSuccess: ({ email }) =>
      navigate(`/login?reason=invited&email=${encodeURIComponent(email)}`, { replace: true }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const differs = form.password !== form.confirm;
    setMismatch(differs);
    if (!differs) accept.mutate();
  }

  if (invite.isLoading) return <AuthCard title="Checking your invitation…">{null}</AuthCard>;

  if (invite.error) {
    return (
      <AuthCard title="This invitation can’t be used">
        <p className="mb-4 text-muted">{errorMessage(invite.error)}</p>
        <Link to="/login" className="text-teal underline">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <AuthCard
      title={`Welcome, ${invite.data!.name}`}
      intro="Choose a password to accept your invitation. Use at least 8 characters, including a letter and a number."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Work email">
          <input
            type="email"
            autoComplete="username"
            className={inputClass}
            value={invite.data!.email}
            readOnly
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={form.password}
            required
            autoFocus
            pattern={PASSWORD_PATTERN}
            title="At least 8 characters, including a letter and a number"
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
        {(mismatch || accept.error) && (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
            {mismatch ? 'The passwords don’t match.' : errorMessage(accept.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={accept.isPending}
          className={`${buttonClass('primary')} mt-1`}
        >
          {accept.isPending ? 'Accepting…' : 'Accept invitation'}
        </button>
      </form>
    </AuthCard>
  );
}
