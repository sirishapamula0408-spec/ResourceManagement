import type { Person, Project, TaskStatus } from '../../lib/api';
import { identityColor, initials } from '../../lib/theme';
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type TaskFilter } from './taskHelpers';

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

/** Project, assignee and free-text filters for the toolbar. */
export function TaskFilters({
  filter,
  onChange,
  people,
  projects,
  showAssignee = true,
}: {
  filter: TaskFilter;
  onChange: (f: TaskFilter) => void;
  people: Person[];
  projects: Project[];
  /** Off where the list is already one person's tasks. */
  showAssignee?: boolean;
}) {
  return (
    <>
      <select
        className={control}
        aria-label="Project"
        value={filter.projectId}
        onChange={(e) => onChange({ ...filter, projectId: e.target.value })}
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
