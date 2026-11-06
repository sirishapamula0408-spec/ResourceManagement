import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Dialog, Field } from './Dialog';
import { RowActions } from './RowActions';
import {
  api,
  auth,
  canManageStaffing,
  LEAVE_TYPE_LABEL,
  type Leave,
  type LeaveType,
  type Person,
} from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';
import { shortDate } from '../lib/theme';

const today = () => new Date().toISOString().slice(0, 10);
const daysFrom = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Working days (Mon-Fri) from start to end, both included; the dashboard counts the same. */
function workingDays(start: string, end: string) {
  let n = 0;
  for (let d = start; d <= end; d = daysFrom(d, 1)) {
    const day = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

// Leave and anything that reads capacity.
const LEAVE_QUERIES = [['leave'], ['dashboard']];

function LeaveDialog({
  leave,
  people,
  onClose,
}: {
  leave: Leave | null;
  people: Person[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = auth.getUser();
  // Staffing roles record anyone's leave; everyone else only their own.
  const choices = canManageStaffing() ? people : people.filter((p) => p.id === me?.id);
  const [form, setForm] = useState({
    personId: leave?.personId ?? (choices.length === 1 ? choices[0].id : ''),
    startDate: leave?.startDate.slice(0, 10) ?? today(),
    endDate: leave?.endDate.slice(0, 10) ?? today(),
    type: leave?.type ?? ('VACATION' as LeaveType),
    note: leave?.note ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const done = () => {
    LEAVE_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      const { personId, ...rest } = form;
      const body = { ...rest, note: rest.note || null };
      return leave
        ? api(`/leave/${leave.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/leave', { method: 'POST', body: JSON.stringify({ personId, ...body }) });
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api(`/leave/${leave!.id}`, { method: 'DELETE' }),
    onSuccess: done,
  });

  return (
    <Dialog
      title={leave ? 'Edit leave' : 'Add leave'}
      onClose={onClose}
      onSave={() => save.mutate()}
      onDelete={leave ? () => remove.mutate() : undefined}
      deleteLabel="Delete leave"
      deleteConfirm="Delete this leave? Their capacity goes back to normal for those days."
      saving={save.isPending || remove.isPending}
      error={save.error || remove.error ? errorMessage(save.error ?? remove.error) : null}
      notice={`${workingDays(form.startDate, form.endDate)} working days; each lowers that week’s capacity by a fifth.`}
    >
      <Field label="Person" full>
        <select
          className={inputClass}
          value={form.personId}
          required
          disabled={!!leave}
          onChange={(e) => set({ personId: e.target.value })}
        >
          <option value="">Choose a person</option>
          {(leave ? [{ id: leave.personId, name: leave.person.name }] : choices).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="First day">
        <input
          type="date"
          className={inputClass}
          value={form.startDate}
          required
          onChange={(e) =>
            set({
              startDate: e.target.value,
              // Keep the range valid when the first day moves past the last.
              endDate: form.endDate < e.target.value ? e.target.value : form.endDate,
            })
          }
        />
      </Field>
      <Field label="Last day">
        <input
          type="date"
          className={inputClass}
          value={form.endDate}
          min={form.startDate}
          required
          onChange={(e) => set({ endDate: e.target.value })}
        />
      </Field>
      <Field label="Type">
        <select
          className={inputClass}
          value={form.type}
          onChange={(e) => set({ type: e.target.value as LeaveType })}
        >
          {Object.entries(LEAVE_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note">
        <input
          className={inputClass}
          value={form.note}
          maxLength={200}
          onChange={(e) => set({ note: e.target.value })}
        />
      </Field>
    </Dialog>
  );
}

/** Upcoming and recent leave (the last 30 days onwards), on the Team page. */
export function LeaveSection({ people }: { people: Person[] }) {
  const me = auth.getUser();
  const staffing = canManageStaffing();
  const [editing, setEditing] = useState<Leave | 'new' | null>(null);
  const qc = useQueryClient();
  const from = daysFrom(today(), -30);
  const { data: leave = [] } = useQuery({
    queryKey: ['leave', from],
    queryFn: () => api<Leave[]>(`/leave?from=${from}`),
  });
  const remove = useMutation({
    mutationFn: (l: Leave) => api(`/leave/${l.id}`, { method: 'DELETE' }),
    onSuccess: () => LEAVE_QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey })),
  });
  const canEdit = (l: Leave) => staffing || l.personId === me?.id;
  // Soonest first; leave that has ended goes to the bottom.
  const now = today();
  const rows = [...leave].sort((a, b) => {
    const endedA = a.endDate.slice(0, 10) < now;
    const endedB = b.endDate.slice(0, 10) < now;
    if (endedA !== endedB) return endedA ? 1 : -1;
    return a.startDate.localeCompare(b.startDate);
  });

  const th =
    'border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';

  return (
    <section className="mb-4 min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
      <h2 className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm font-semibold">
        Leave
        <span className="flex items-center gap-3 text-xs font-normal text-muted">
          lowers capacity on the Resource Dashboard
          <button className={buttonClass()} onClick={() => setEditing('new')}>
            Add leave
          </button>
        </span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Person', 'Dates', 'Working days', 'Type', 'Note', ''].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const start = l.startDate.slice(0, 10);
              const end = l.endDate.slice(0, 10);
              return (
                <tr key={l.id} className={end < now ? 'text-muted' : ''}>
                  <td className={td}>{l.person.name}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`}
                  </td>
                  <td className={td}>{workingDays(start, end)}</td>
                  <td className={td}>{LEAVE_TYPE_LABEL[l.type]}</td>
                  <td className={td}>{l.note}</td>
                  <td className={td}>
                    {canEdit(l) && (
                      <RowActions
                        editLabel="Edit leave"
                        onEdit={() => setEditing(l)}
                        onDelete={() => remove.mutate(l)}
                        deleteLabel="Delete leave"
                        deleteConfirm={`Delete ${l.person.name}’s leave?`}
                        busy={remove.isPending}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="p-2.5 text-center text-xs text-muted">
                  No leave recorded for the last 30 days or ahead.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <LeaveDialog
          leave={editing === 'new' ? null : editing}
          people={people}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
