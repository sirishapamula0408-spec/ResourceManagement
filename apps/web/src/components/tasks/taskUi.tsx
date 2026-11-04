import { useState } from 'react';
import type { Epic, LabelCount, Person, Project, Sprint, TaskStatus } from '../../lib/api';
import { identityColor, initials } from '../../lib/theme';
import {
  NONE,
  normalizeLabel,
  PRIORITY_LABEL,
  SPRINT_STATUS_LABEL,
  STATUS_LABEL,
  type Priority,
  type TaskFilter,
} from './taskHelpers';

const STATUS_CLASS: Record<TaskStatus, string> = {
  BACKLOG: 'bg-panel2 border border-line',
  TODO: 'bg-blue-soft',
  IN_PROGRESS: 'bg-amber-soft',
  IN_REVIEW: 'bg-plum-soft',
  BLOCKED: 'bg-red-soft text-red',
  DONE: 'bg-green-soft',
};

const PRIORITY_CLASS: Record<Priority, string> = {
  CRITICAL: 'bg-plum text-white',
  HIGH: 'bg-plum-soft text-plum',
  MEDIUM: 'bg-amber-soft',
  LOW: 'bg-blue-soft',
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`rounded-[3px] px-[7px] py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`rounded-[3px] px-1.5 py-px text-[11px] font-semibold ${PRIORITY_CLASS[priority]}`}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Epic name on a card or row, in the epic's colour. */
export function EpicChip({ epic }: { epic: { name: string; color: string | null } }) {
  const color = epic.color ?? '#6b7280';
  return (
    <span
      className="inline-flex max-w-[12rem] items-center truncate rounded-[3px] border px-1.5 py-px text-[11px] font-semibold"
      style={{ borderColor: color, color }}
      title={`Epic: ${epic.name}`}
    >
      {epic.name}
    </span>
  );
}

/** A label on a card or row. */
export function LabelChip({ name }: { name: string }) {
  return (
    <span className="inline-block max-w-[10rem] truncate rounded-[3px] bg-panel2 px-1.5 py-px text-[11px] text-muted ring-1 ring-line">
      {name}
    </span>
  );
}

/** Labels on a card or row: the first few, then "+n". */
export function LabelChips({ labels, max = 3 }: { labels: string[]; max?: number }) {
  if (!labels.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1" aria-label={`Labels: ${labels.join(', ')}`}>
      {labels.slice(0, max).map((l) => (
        <LabelChip key={l} name={l} />
      ))}
      {labels.length > max && (
        <span className="text-[11px] text-muted">+{labels.length - max}</span>
      )}
    </span>
  );
}

/**
 * Label editor: chips with a remove button, and a box that adds a label on Enter or comma,
 * suggesting labels already in use.
 */
export function LabelInput({
  value,
  onChange,
  suggestions,
  disabled = false,
}: {
  value: string[];
  onChange: (labels: string[]) => void;
  suggestions: LabelCount[];
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const l = normalizeLabel(raw);
    if (l && !value.includes(l) && value.length < 10) onChange([...value, l]);
    setText('');
  };
  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1.5">
      {value.map((l) => (
        <span
          key={l}
          className="inline-flex items-center gap-1 rounded-[3px] bg-panel2 px-1.5 py-px text-xs text-ink ring-1 ring-line"
        >
          {l}
          {!disabled && (
            <button
              type="button"
              className="text-muted hover:text-red"
              aria-label={`Remove label ${l}`}
              onClick={() => onChange(value.filter((x) => x !== l))}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {!disabled && value.length < 10 && (
        <>
          <input
            className="min-w-[8rem] flex-1 bg-transparent text-sm text-ink outline-none"
            list="label-suggestions"
            placeholder={value.length ? 'Add another' : 'Add labels, e.g. frontend'}
            aria-label="Add a label"
            value={text}
            onChange={(e) => {
              // Picking a suggestion or typing a comma adds the label.
              const v = e.target.value;
              if (v.endsWith(',')) add(v.slice(0, -1));
              else if (suggestions.some((s) => s.name === v)) add(v);
              else setText(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                e.preventDefault();
                add(text);
              } else if (e.key === 'Backspace' && !text && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={() => text.trim() && add(text)}
          />
          <datalist id="label-suggestions">
            {suggestions
              .filter((s) => !value.includes(s.name))
              .map((s) => (
                <option key={s.name} value={s.name} />
              ))}
          </datalist>
        </>
      )}
    </div>
  );
}

/** Initials avatar coloured by person, consistent with the dashboard heat map. */
export function Avatar({
  name,
  allNames,
  size = 28,
}: {
  name: string | null;
  allNames: string[];
  size?: number;
}) {
  const style = { width: size, height: size, fontSize: size < 26 ? 9 : 11 };
  if (!name) {
    return (
      <span
        className="inline-grid shrink-0 place-items-center rounded-full bg-line font-bold text-muted"
        style={style}
        title="Unassigned"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ ...style, background: identityColor(name, allNames) }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

const control = 'rounded-md border border-line bg-panel px-2.5 py-1.5';

/** Project, assignee, sprint, epic and free-text filters for the toolbar. */
export function TaskFilters({
  filter,
  onChange,
  people,
  projects,
  sprints = [],
  epics = [],
  labels = [],
  showAssignee = true,
}: {
  filter: TaskFilter;
  onChange: (f: TaskFilter) => void;
  people: Person[];
  projects: Project[];
  sprints?: Sprint[];
  epics?: Epic[];
  labels?: LabelCount[];
  /** Off where the list is already one person's tasks. */
  showAssignee?: boolean;
}) {
  // The chosen project's sprints and epics; complete sprints only while selected.
  const inProject = <T extends { projectId: string }>(rows: T[]) =>
    filter.projectId ? rows.filter((r) => r.projectId === filter.projectId) : rows;
  const sprintChoices = inProject(sprints).filter(
    (s) => s.status !== 'CLOSED' || s.id === filter.sprintId,
  );
  const epicChoices = inProject(epics);
  const label = (r: { name: string; project: { code: string } }) =>
    filter.projectId ? r.name : `${r.project.code} · ${r.name}`;
  return (
    <>
      <select
        className={control}
        aria-label="Project"
        value={filter.projectId}
        onChange={(e) => {
          const projectId = e.target.value;
          // A sprint or epic from another project would hide everything, so drop it.
          const keep = (id: string, rows: { id: string; projectId: string }[]) =>
            !projectId || id === NONE || rows.find((r) => r.id === id)?.projectId === projectId
              ? id
              : '';
          onChange({
            ...filter,
            projectId,
            sprintId: keep(filter.sprintId, sprints),
            epicId: keep(filter.epicId, epics),
          });
        }}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {showAssignee && (
        <select
          className={control}
          aria-label="Assignee"
          value={filter.assigneeId}
          onChange={(e) => onChange({ ...filter, assigneeId: e.target.value })}
        >
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      {(sprints.length > 0 || filter.sprintId) && (
        <select
          className={control}
          aria-label="Sprint"
          value={filter.sprintId}
          onChange={(e) => onChange({ ...filter, sprintId: e.target.value })}
        >
          <option value="">All sprints</option>
          {sprintChoices.map((s) => (
            <option key={s.id} value={s.id}>
              {label(s)}
              {s.status !== 'PLANNED' ? ` (${SPRINT_STATUS_LABEL[s.status].toLowerCase()})` : ''}
            </option>
          ))}
          <option value={NONE}>No sprint (backlog)</option>
        </select>
      )}
      {(epics.length > 0 || filter.epicId) && (
        <select
          className={control}
          aria-label="Epic"
          value={filter.epicId}
          onChange={(e) => onChange({ ...filter, epicId: e.target.value })}
        >
          <option value="">All epics</option>
          {epicChoices.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {label(ep)}
            </option>
          ))}
          <option value={NONE}>No epic</option>
        </select>
      )}
      {(labels.length > 0 || filter.label) && (
        <select
          className={control}
          aria-label="Label"
          value={filter.label}
          onChange={(e) => onChange({ ...filter, label: e.target.value })}
        >
          <option value="">All labels</option>
          {labels.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
          {filter.label && !labels.some((l) => l.name === filter.label) && (
            <option value={filter.label}>{filter.label}</option>
          )}
        </select>
      )}
      <input
        type="search"
        className={`${control} min-w-[200px]`}
        placeholder="Search tasks"
        aria-label="Search tasks"
        value={filter.q}
        onChange={(e) => onChange({ ...filter, q: e.target.value })}
      />
    </>
  );
}

/** Bottom-centre toast; pair with useToast(). */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-bg"
    >
      {message}
    </div>
  );
}
