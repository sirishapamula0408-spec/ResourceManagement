import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { Field } from '../components/Dialog';
import { api } from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';

/** Change your own password; required after someone else sets or resets it. */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [mismatch, setMismatch] = useState(false);
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ name: string; mustChangePassword: boolean }>('/auth/me'),
  });
  const required = me?.mustChangePassword ?? false;

  const change = useMutation({
    mutationFn: () =>
      api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      }),
    onSuccess: () => navigate('/dashboard', { replace: true }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const differs = form.newPassword !== form.confirm;
    setMismatch(differs);
    if (!differs) change.mutate();
  }

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <AuthCard
      title={required ? 'Choose your password' : 'Change password'}
      intro={
        required
          ? `Welcome${me?.name ? `, ${me.name}` : ''}. Your password was set for you; choose your own to continue. Use at least 8 characters, including a letter and a number.`
          : 'Use at least 8 characters, including a letter and a number.'
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label={required ? 'Temporary password' : 'Current password'}>
          <input
            type="password"
            autoComplete="current-password"
            className={inputClass}
            value={form.currentPassword}
            required
            autoFocus
            onChange={(e) => set({ currentPassword: e.target.value })}
          />
        </Field>
        <Field label="New password">
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            className={inputClass}
            value={form.newPassword}
            required
            onChange={(e) => set({ newPassword: e.target.value })}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={form.confirm}
            required
            onChange={(e) => set({ confirm: e.target.value })}
          />
        </Field>
        {(mismatch || change.error) && (
          <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
            {mismatch ? 'The new passwords don’t match.' : errorMessage(change.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={change.isPending}
          className={`${buttonClass('primary')} mt-1`}
        >
          {change.isPending ? 'Saving…' : 'Save password'}
        </button>
        {!required && (
          <Link to="/dashboard" className="text-center text-xs text-muted hover:text-ink">
            Cancel
          </Link>
        )}
      </form>
    </AuthCard>
  );
}
