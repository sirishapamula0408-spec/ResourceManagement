import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  api,
  auth,
  type Lead,
  type LeadPriority,
  type LeadSource,
  type LeadStage,
} from '../../lib/api';
import { errorMessage, inputClass } from '../../lib/forms';
import {
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABEL,
  LEAD_SOURCES,
  LEAD_STAGES,
  SOURCE_LABEL,
  STAGE_LABEL,
} from '../../lib/leads';
import { Dialog, Field } from '../Dialog';

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/** Add or edit a lead. Read-only for roles that may only view the pipeline. */
export function LeadDialog({
  lead,
  owners,
  readOnly,
  onClose,
  onSaved,
}: {
  lead: Lead | null;
  owners: { id: string; name: string }[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();
  const me = auth.getUser();
  const [form, setForm] = useState({
    company: lead?.company ?? '',
    contactName: lead?.contactName ?? '',
    contactEmail: lead?.contactEmail ?? '',
    contactPhone: lead?.contactPhone ?? '',
    source: lead?.source ?? ('OTHER' as LeadSource),
    stage: lead?.stage ?? ('NEW' as LeadStage),
    priority: lead?.priority ?? ('MEDIUM' as LeadPriority),
    estimatedValue: lead?.estimatedValue ? String(Number(lead.estimatedValue)) : '',
    expectedCloseDate: day(lead?.expectedCloseDate ?? null),
    nextFollowUp: day(lead?.nextFollowUp ?? null),
    ownerId: lead ? (lead.owner?.id ?? '') : (me?.id ?? ''),
    notes: lead?.notes ?? '',
    lostReason: lead?.lostReason ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const done = (message: string) => {
    qc.invalidateQueries({ queryKey: ['leads'] });
    onSaved(message);
    onClose();
  };
  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        ...form,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        estimatedValue: form.estimatedValue === '' ? null : Number(form.estimatedValue),
        expectedCloseDate: form.expectedCloseDate || null,
        nextFollowUp: form.nextFollowUp || null,
        ownerId: form.ownerId || null,
        notes: form.notes || null,
        lostReason: form.stage === 'LOST' ? form.lostReason || null : null,
      });
      return lead
        ? api(`/leads/${lead.id}`, { method: 'PATCH', body })
        : api('/leads', { method: 'POST', body });
    },
    onSuccess: () => done(lead ? `${form.company} saved` : `${form.company} added`),
  });
  const remove = useMutation({
    mutationFn: () => api(`/leads/${lead!.id}`, { method: 'DELETE' }),
    onSuccess: () => done(`${lead!.company} deleted`),
  });

  const apiError = save.error ?? remove.error;
  // Keep a current owner in the list even if they are no longer a sales user.
  const ownerChoices =
    lead?.owner && !owners.some((o) => o.id === lead.owner!.id) ? [...owners, lead.owner] : owners;

  return (
    <Dialog
      title={lead ? `${lead.company} · ${readOnly ? 'Lead' : 'Edit lead'}` : 'Add lead'}
      onClose={onClose}
      onSave={() => save.mutate()}
      onDelete={lead && !readOnly ? () => remove.mutate() : undefined}
      deleteConfirm={`Delete the lead for ${lead?.company}? This can’t be undone.`}
      saving={save.isPending || remove.isPending}
      error={apiError ? errorMessage(apiError) : null}
      readOnly={readOnly}
      notice={
        readOnly
          ? 'You can view the sales pipeline; only sales users and admins edit leads.'
          : undefined
      }
    >
      <Field label="Company">
        <input
          className={inputClass}
          value={form.company}
          required
          disabled={readOnly}
          autoFocus={!lead}
          onChange={(e) => set({ company: e.target.value })}
        />
      </Field>
      <Field label="Contact name">
        <input
          className={inputClass}
          value={form.contactName}
          required
          disabled={readOnly}
          onChange={(e) => set({ contactName: e.target.value })}
        />
      </Field>
      <Field label="Contact email">
        <input
          type="email"
          className={inputClass}
          value={form.contactEmail}
          disabled={readOnly}
          onChange={(e) => set({ contactEmail: e.target.value })}
        />
      </Field>
      <Field label="Contact phone">
        <input
          type="tel"
          className={inputClass}
          value={form.contactPhone}
          disabled={readOnly}
          onChange={(e) => set({ contactPhone: e.target.value })}
        />
      </Field>
      <Field label="Stage">
        <select
          className={inputClass}
          value={form.stage}
          disabled={readOnly}
          onChange={(e) => set({ stage: e.target.value as LeadStage })}
        >
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Priority">
        <select
          className={inputClass}
          value={form.priority}
          disabled={readOnly}
          onChange={(e) => set({ priority: e.target.value as LeadPriority })}
        >
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {LEAD_PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Estimated value (₹)">
        <input
          type="number"
          min={0}
          step={1000}
          className={inputClass}
          value={form.estimatedValue}
          disabled={readOnly}
          onChange={(e) => set({ estimatedValue: e.target.value })}
        />
      </Field>
      <Field label="Source">
        <select
          className={inputClass}
          value={form.source}
          disabled={readOnly}
          onChange={(e) => set({ source: e.target.value as LeadSource })}
        >
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Expected close">
        <input
          type="date"
          className={inputClass}
          value={form.expectedCloseDate}
          disabled={readOnly}
          onChange={(e) => set({ expectedCloseDate: e.target.value })}
        />
      </Field>
      <Field label="Next follow-up">
        <input
          type="date"
          className={inputClass}
          value={form.nextFollowUp}
          disabled={readOnly}
          onChange={(e) => set({ nextFollowUp: e.target.value })}
        />
      </Field>
      <Field label="Owner">
        <select
          className={inputClass}
          value={form.ownerId}
          disabled={readOnly}
          onChange={(e) => set({ ownerId: e.target.value })}
        >
          <option value="">No owner</option>
          {ownerChoices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      {form.stage === 'LOST' ? (
        <Field label="Why was it lost?">
          <input
            className={inputClass}
            value={form.lostReason}
            disabled={readOnly}
            onChange={(e) => set({ lostReason: e.target.value })}
          />
        </Field>
      ) : (
        <span />
      )}
      <Field label="Notes" full>
        <textarea
          className={inputClass}
          rows={3}
          value={form.notes}
          disabled={readOnly}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
    </Dialog>
  );
}
