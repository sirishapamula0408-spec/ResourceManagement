import { ApiError } from './api';

/** Readable message from an API error, including field-level validation messages. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = (e.details as { fieldErrors?: Record<string, string[]> } | undefined)
      ?.fieldErrors;
    const list = fields
      ? Object.entries(fields).map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      : [];
    if (e.status === 401) return 'Your session has expired. Sign in again.';
    if (e.status === 403) return e.message || 'You don’t have permission to do that.';
    return list.length ? list.join(' · ') : e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

export function buttonClass(kind: 'default' | 'primary' = 'default') {
  const base = 'rounded-md border px-3 py-[7px] font-medium disabled:opacity-60';
  return kind === 'primary'
    ? `${base} border-teal bg-teal text-white hover:brightness-105`
    : `${base} border-line bg-panel hover:bg-panel2`;
}

export const inputClass =
  'rounded-md border border-line bg-panel px-2.5 py-[7px] text-sm text-ink disabled:opacity-60';

/** Queries that show project or staffing data and must refresh after a change. */
export const STAFFING_QUERIES = [
  ['projects'],
  ['people'],
  ['tasks'],
  ['dashboard'],
  ['departments'],
];
