import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LeadDialog } from '../components/leads/LeadDialog';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { RowActions } from '../components/RowActions';
import { useToast } from '../components/tasks/taskHelpers';
import { Toast } from '../components/tasks/taskUi';
import { api, canEditLeads, type Lead, type LeadPriority, type LeadStage } from '../lib/api';
import { buttonClass, errorMessage } from '../lib/forms';
import {
  followUpDue,
  formatInr,
  formatInrCompact,
  isOpenLead,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_CLASS,
  LEAD_PRIORITY_LABEL,
  LEAD_PRIORITY_RANK,
  LEAD_STAGES,
  pipelineSummary,
  SOURCE_LABEL,
  STAGE_CLASS,
  STAGE_LABEL,
} from '../lib/leads';
import { usePagination } from '../lib/pagination';

type SortKey = 'company' | 'stage' | 'priority' | 'value' | 'close' | 'followUp' | 'owner';
const COLUMNS: [SortKey, string][] = [
  ['company', 'Company'],
  ['stage', 'Stage'],
  ['priority', 'Priority'],
  ['value', 'Value'],
  ['close', 'Expected close'],
  ['followUp', 'Next follow-up'],
  ['owner', 'Owner'],
];

const sortValue = (l: Lead, key: SortKey): string | number => {
  switch (key) {
    case 'company':
      return l.company.toLowerCase();
    case 'stage':
      return LEAD_STAGES.indexOf(l.stage);
    case 'priority':
      return LEAD_PRIORITY_RANK[l.priority];
    case 'value':
      return Number(l.estimatedValue ?? -1);
    case 'close':
      return l.expectedCloseDate ?? '9999';
    case 'followUp':
      return l.nextFollowUp ?? '9999';
    case 'owner':
      return l.owner?.name ?? '~';
  }
};

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

function Tile({
  label,
  value,
  note,
  tone = '',
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="bg-panel px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`text-[22px] font-bold tracking-tight ${tone}`}>{value}</div>
      {note && <div className="text-xs text-muted">{note}</div>}
    </div>
  );
}

const control = 'rounded-md border border-line bg-panel px-2.5 py-1.5';

/** The sales pipeline: every lead, its stage, priority, value and next follow-up. */
export function LeadsPage() {
  const editable = canEditLeads();
  const qc = useQueryClient();
  const [toastMessage, showToast] = useToast();
  const [open, setOpen] = useState<Lead | 'new' | null>(null);
  const [filter, setFilter] = useState({
    stage: '' as LeadStage | '' | 'OPEN',
    priority: '' as LeadPriority | '',
    ownerId: '',
    q: '',
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'priority', dir: 1 });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api<Lead[]>('/leads'),
  });
  const { data: owners = [] } = useQuery({
    queryKey: ['leads', 'owners'],
    queryFn: () => api<{ id: string; name: string }[]>('/leads/owners'),
  });
  const remove = useMutation({
    mutationFn: (l: Lead) => api(`/leads/${l.id}`, { method: 'DELETE' }),
    onSuccess: (_r, l) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      showToast(`${l.company} deleted`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  const summary = pipelineSummary(leads);
  const q = filter.q.trim().toLowerCase();
  const rows = leads
    .filter(
      (l) =>
        (!filter.stage || (filter.stage === 'OPEN' ? isOpenLead(l) : l.stage === filter.stage)) &&
        (!filter.priority || l.priority === filter.priority) &&
        (!filter.ownerId || l.owner?.id === filter.ownerId) &&
        (!q ||
          `${l.company} ${l.contactName} ${l.contactEmail ?? ''} ${l.notes ?? ''}`
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      // Ties keep the soonest follow-up first, so the next call is always near the top.
      const primary = (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
      return primary || (a.nextFollowUp ?? '9999').localeCompare(b.nextFollowUp ?? '9999');
    });
  const paged = usePagination(rows, 25, JSON.stringify([filter, sort]));

  const th =
    'cursor-pointer select-none border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
  const td = 'border-b border-line px-2.5 py-[9px] align-middle';

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={editable ? undefined : 'View only: sales users and admins update the pipeline.'}
      >
        {editable && (
          <button className={buttonClass('primary')} onClick={() => setOpen('new')}>
            Add lead
          </button>
        )}
      </PageHeader>

      <section
        aria-label="Pipeline summary"
        className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4"
      >
        <Tile
          label="Open pipeline"
          value={formatInrCompact(summary.openValue)}
          note={`${summary.openCount} open leads`}
        />
        <Tile
          label="High priority"
          value={summary.highPriority}
          note="open leads"
          tone="text-plum"
        />
        <Tile
          label="Follow-ups due"
          value={summary.followUpsDue}
          note="today or overdue"
          tone={summary.followUpsDue ? 'text-red' : ''}
        />
        <Tile
          label="Won this month"
          value={formatInrCompact(summary.wonThisMonth)}
          tone="text-green"
        />
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Stages">
        {(['', 'OPEN', ...LEAD_STAGES] as const).map((st) => {
          const count =
            st === '' ? leads.length : st === 'OPEN' ? summary.openCount : summary.byStage[st];
          return (
            <button
              key={st || 'all'}
              type="button"
              aria-pressed={filter.stage === st}
              onClick={() => setFilter((f) => ({ ...f, stage: st }))}
              className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-panel"
            >
              {st === '' ? 'All' : st === 'OPEN' ? 'Open' : STAGE_LABEL[st]}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
        <span className="flex-1" />
        <select
          className={control}
          aria-label="Priority"
          value={filter.priority}
          onChange={(e) =>
            setFilter((f) => ({ ...f, priority: e.target.value as LeadPriority | '' }))
          }
        >
          <option value="">Any priority</option>
          {LEAD_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {LEAD_PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select
          className={control}
          aria-label="Owner"
          value={filter.ownerId}
          onChange={(e) => setFilter((f) => ({ ...f, ownerId: e.target.value }))}
        >
          <option value="">Everyone</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          className={`${control} min-w-[200px]`}
          placeholder="Search leads"
          aria-label="Search leads"
          value={filter.q}
          onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
        />
      </div>

      <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th
                    key={key}
                    className={`${th} ${key === 'value' ? 'text-right' : ''}`}
                    aria-sort={
                      sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'
                    }
                    onClick={() =>
                      setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))
                    }
                  >
                    {label}
                    {sort.key === key && (sort.dir > 0 ? ' ▲' : ' ▼')}
                  </th>
                ))}
                <th className="border-b border-line" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-2.5 text-center text-xs text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {paged.items.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer hover:[&>td]:bg-panel2"
                  onClick={() => setOpen(l)}
                >
                  <td className={td}>
                    <div className="font-semibold">{l.company}</div>
                    <div className="text-xs text-muted">
                      {l.contactName} · {SOURCE_LABEL[l.source]}
                    </div>
                  </td>
                  <td className={td}>
                    <span
                      className={`rounded-[3px] px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap ${STAGE_CLASS[l.stage]}`}
                    >
                      {STAGE_LABEL[l.stage]}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={`rounded-[3px] px-1.5 py-px text-[11px] font-semibold ${LEAD_PRIORITY_CLASS[l.priority]}`}
                    >
                      {LEAD_PRIORITY_LABEL[l.priority]}
                    </span>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap tabular-nums`}>
                    {formatInr(l.estimatedValue)}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{shortDate(l.expectedCloseDate)}</td>
                  <td
                    className={`${td} whitespace-nowrap ${followUpDue(l) ? 'font-semibold text-red' : ''}`}
                  >
                    {isOpenLead(l) ? shortDate(l.nextFollowUp) : '—'}
                  </td>
                  <td className={td}>
                    {l.owner?.name ?? <span className="text-muted">No owner</span>}
                  </td>
                  <td className={td}>
                    <RowActions
                      onEdit={() => setOpen(l)}
                      editLabel={editable ? 'Edit' : 'View'}
                      onDelete={editable ? () => remove.mutate(l) : undefined}
                      deleteConfirm={`Delete the lead for ${l.company}? This can’t be undone.`}
                      busy={remove.isPending}
                    />
                  </td>
                </tr>
              ))}
              {!isLoading && !rows.length && (
                <tr>
                  <td colSpan={8} className="p-2.5 text-center text-xs text-muted">
                    {leads.length
                      ? 'No leads match. Clear the filters to see everything.'
                      : 'No leads yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} noun="leads" />
      </section>

      {open && (
        <LeadDialog
          lead={open === 'new' ? null : open}
          owners={owners}
          readOnly={!editable}
          onClose={() => setOpen(null)}
          onSaved={showToast}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
