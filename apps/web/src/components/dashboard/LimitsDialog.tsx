import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { errorMessage, inputClass } from '../../lib/forms';
import { Dialog, Field } from '../Dialog';

export interface Limits {
  underUtilizedPct: number;
  overUtilizedPct: number;
}

/** Admins set the under- and over-utilized limits the dashboard counts people against. */
export function LimitsDialog({ limits, onClose }: { limits: Limits; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(limits);
  const save = useMutation({
    mutationFn: () =>
      api<Limits>('/settings/thresholds', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });
  const crossed = form.underUtilizedPct >= form.overUtilizedPct;

  return (
    <Dialog
      title="Utilization limits"
      onClose={onClose}
      onSave={() => !crossed && save.mutate()}
      saving={save.isPending}
      error={
        crossed
          ? 'The under-utilized limit must be below the over-utilized limit.'
          : save.error
            ? errorMessage(save.error)
            : null
      }
      notice="Used for this week’s under- and over-utilized counts for everyone. Defaults: 70% and 100%."
    >
      <Field label="Under-utilized below (%)">
        <input
          type="number"
          min={1}
          max={100}
          required
          className={inputClass}
          value={form.underUtilizedPct}
          onChange={(e) => setForm({ ...form, underUtilizedPct: Number(e.target.value) })}
        />
      </Field>
      <Field label="Over-utilized above (%)">
        <input
          type="number"
          min={50}
          max={300}
          required
          className={inputClass}
          value={form.overUtilizedPct}
          onChange={(e) => setForm({ ...form, overUtilizedPct: Number(e.target.value) })}
        />
      </Field>
    </Dialog>
  );
}
