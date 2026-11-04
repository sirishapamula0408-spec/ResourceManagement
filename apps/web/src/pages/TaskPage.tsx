import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { TaskComments } from '../components/tasks/TaskComments';
import { TaskHistory } from '../components/tasks/TaskHistory';
import { TaskLinks } from '../components/tasks/TaskLinks';
import { TaskSubtasks } from '../components/tasks/TaskSubtasks';
import {
  BlockedBadge,
  EpicChip,
  LabelInput,
  PriorityBadge,
  Toast,
} from '../components/tasks/taskUi';
import {
  dueLabel,
  hours,
  isOverdue,
  PRIORITY_LABEL,
  SPRINT_STATUS_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  setProjectContext,
  useLabels,
  usePlanningLookups,
  useTaskLookups,
  useTaskPermissions,
  useToast,
} from '../components/tasks/taskHelpers';
import {
  api,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '../lib/api';
import { buttonClass, errorMessage, inputClass } from '../lib/forms';
import { fmt } from '../lib/theme';
import { ProjectSidebar, type ProjectView } from './project/ProjectSidebar';

const PRIORITIES: TaskPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const TYPES: TaskType[] = ['STORY', 'TASK', 'BUG', 'SUPPORT'];

/** Status button colours, as on the board's status pills. */
const STATUS_SELECT: Record<TaskStatus, string> = {
  BACKLOG: 'bg-panel2',
  TODO: 'bg-blue-soft',
  IN_PROGRESS: 'bg-amber-soft',
  IN_REVIEW: 'bg-plum-soft',
  BLOCKED: 'bg-red-soft text-red',
  DONE: 'bg-green-soft',
};

const QUERIES = [
  ['tasks'],
  ['dashboard'],
  ['projects'],
  ['sprints'],
  ['epics'],
  ['labels'],
  ['history'],
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** One row of the details panel: label on the left, value or control on the right. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2 py-1.5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

const fieldClass =
  'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-line focus:border-line focus:bg-panel disabled:hover:border-transparent';

/** Summary heading that turns into a text box on click (for those who may edit it). */
function EditableTitle({
  value,
  canEdit,
  onSave,
}: {
  value: string;
  canEdit: boolean;
  onSave: (title: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    const title = draft?.trim();
    if (title && title !== value) onSave(title);
    setDraft(null);
  };
  if (draft !== null) {
    return (
      <input
        className={`${inputClass} w-full text-xl font-bold`}
        aria-label="Summary"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
    );
  }
  return (
    <h1
      className={`rounded-md px-1 text-xl font-bold tracking-tight ${canEdit ? 'cursor-text hover:bg-panel2' : ''}`}
      title={canEdit ? 'Click to edit the summary' : undefined}
      onClick={canEdit ? () => setDraft(value) : undefined}
    >
      {value}
    </h1>
  );
}

/** Description shown as text, edited in a text box with Save / Cancel. */
function Description({
  value,
  canEdit,
  onSave,
}: {
  value: string | null;
  canEdit: boolean;
  onSave: (description: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <section aria-labelledby="description-heading">
      <h2 id="description-heading" className="mb-1.5 text-sm font-semibold">
        Description
      </h2>
      {draft !== null ? (
        <div className="flex flex-col gap-2">
          <textarea
            className={inputClass}
            rows={6}
            aria-label="Description"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <span className="flex gap-2">
            <button
              type="button"
              className={buttonClass('primary')}
              onClick={() => {
                onSave(draft.trim() || null);
                setDraft(null);
              }}
            >
              Save
            </button>
            <button type="button" className={buttonClass()} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <div
          className={`min-h-[3rem] rounded-md px-2 py-1.5 text-sm whitespace-pre-wrap ${canEdit ? 'cursor-text hover:bg-panel2' : ''}`}
          onClick={canEdit ? () => setDraft(value ?? '') : undefined}
        >
          {value || (
            <span className="text-muted">{canEdit ? 'Add a description…' : 'No description.'}</span>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * A task's own page, like a JIRA issue view: breadcrumb, summary and status at the top; the
 * description, sub-tasks, links and comments on the left; a details panel on the right that
 * saves each field as it changes. Opened at /browse/<KEY> from the board, lists and links.
 */
export function TaskPage() {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [toastMessage, showToast] = useToast();
  const [logHours, setLogHours] = useState('');
  const [activity, setActivity] = useState<'comments' | 'history'>('comments');
  const { projects, personNames } = useTaskLookups();
  const { sprints, epics } = usePlanningLookups();
  const labelSuggestions = useLabels();
  const { canManageProject, canWork } = useTaskPermissions();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  const task = tasks.find((t) => t.key.toLowerCase() === key.toLowerCase());
  // The view the task was opened from (board, list, backlog), kept current in the sidebar.
  const from = (useLocation().state as { from?: ProjectView } | null)?.from;

  // New tasks created from here default to this task's project.
  useEffect(() => {
    setProjectContext(task?.project.id ?? null);
    return () => setProjectContext(null);
  }, [task?.project.id]);

  const refresh = () => QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  const patch = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      api(`/tasks/${task!.id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
    onSuccess: () => {
      refresh();
      showToast(`${task!.key} saved`);
    },
    onError: (e) => {
      refresh(); // put the field back as the server has it
      showToast(errorMessage(e));
    },
  });
  const log = useMutation({
    mutationFn: (h: number) =>
      api(`/tasks/${task!.id}/worklogs`, { method: 'POST', body: JSON.stringify({ hours: h }) }),
    onSuccess: (_r, h) => {
      setLogHours('');
      refresh();
      showToast(`Logged ${fmt(h, 1)}h on ${task!.key}`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/tasks/${task!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refresh();
      navigate(`/projects/${task!.project.code}/board`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  if (isLoading) return <p className="text-xs text-muted">Loading…</p>;
  if (!task) {
    return (
      <p className="text-muted">
        Task {key.toUpperCase()} was not found, or you cannot see it.{' '}
        <Link to="/projects" className="text-teal hover:underline">
          Back to projects
        </Link>
      </p>
    );
  }

  const manages = canManageProject(task.project.id);
  const works = canWork(task);
  const project = projects.find((p) => p.id === task.project.id);
  const members = project?.members ?? [];
  const assignees =
    task.assignee && !members.some((m) => m.id === task.assignee!.id)
      ? [...members, task.assignee]
      : members;
  const sprintChoices = sprints.filter(
    (s) => s.projectId === task.project.id && (s.status !== 'CLOSED' || s.id === task.sprint?.id),
  );
  const epicChoices = epics.filter((e) => e.projectId === task.project.id);
  const set = (fields: Record<string, unknown>) => patch.mutate(fields);
  const openTask = (t: Task) => navigate(`/browse/${t.key}`, { state: { from } });
  const est = hours(task.estimateHours);

  return (
    <div className="grid gap-5 md:grid-cols-[210px_minmax(0,1fr)]">
      {project ? (
        <ProjectSidebar project={project} allCodes={projects.map((p) => p.code)} highlight={from} />
      ) : (
        <span />
      )}
      <article className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-1.5">
            <nav
              aria-label="Breadcrumb"
              className="flex flex-wrap items-center gap-1 text-xs text-muted"
            >
              <Link to="/projects" className="hover:underline">
                Projects
              </Link>
              /
              <Link to={`/projects/${task.project.code}`} className="hover:underline">
                {task.project.name}
              </Link>
              {task.parent && (
                <>
                  /
                  <Link to={`/browse/${task.parent.key}`} className="hover:underline">
                    {task.parent.key}
                  </Link>
                </>
              )}
              /<span className="font-semibold text-ink">{task.key}</span>
            </nav>
            <EditableTitle
              value={task.title}
              canEdit={manages}
              onSave={(title) => set({ title })}
            />
            <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted">
              <span>{TYPE_LABEL[task.type]}</span>
              <PriorityBadge priority={task.priority} />
              <BlockedBadge count={task.openBlockers} />
              {task.epic && <EpicChip epic={task.epic} />}
              {task.parent && (
                <span>
                  Sub-task of{' '}
                  <Link to={`/browse/${task.parent.key}`} className="text-teal hover:underline">
                    {task.parent.key} · {task.parent.title}
                  </Link>
                </span>
              )}
            </div>
          </header>

          <Description
            value={task.description}
            canEdit={manages}
            onSave={(description) => set({ description })}
          />
          {!task.parent && <TaskSubtasks task={task} canAdd={manages} onOpen={openTask} />}
          <TaskLinks task={task} canEdit={manages || works} onOpen={openTask} />
          <section aria-labelledby="activity-heading">
            <div className="mb-2 flex items-center gap-3">
              <h2 id="activity-heading" className="text-sm font-semibold">
                Activity
              </h2>
              <div className="flex gap-1" role="tablist" aria-label="Activity">
                {(['comments', 'history'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activity === tab}
                    className={`rounded-[3px] px-2 py-0.5 text-xs font-medium ${
                      activity === tab ? 'bg-teal-soft text-teal' : 'text-muted hover:bg-btn'
                    }`}
                    onClick={() => setActivity(tab)}
                  >
                    {tab === 'comments' ? 'Comments' : 'History'}
                  </button>
                ))}
              </div>
            </div>
            {activity === 'comments' ? (
              <TaskComments taskId={task.id} personNames={personNames} />
            ) : (
              <TaskHistory taskId={task.id} personNames={personNames} />
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-5 xl:self-start">
          <div className="flex items-center gap-2">
            <select
              className={`rounded-md border border-line px-3 py-1.5 text-sm font-semibold ${STATUS_SELECT[task.status]}`}
              aria-label="Status"
              value={task.status}
              disabled={!works}
              onChange={(e) => set({ status: e.target.value })}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <span className="flex-1" />
            {manages && (
              <button
                type="button"
                className={`${buttonClass()} text-red`}
                disabled={remove.isPending}
                onClick={() =>
                  window.confirm(`Delete ${task.key}? This can’t be undone.`) && remove.mutate()
                }
              >
                Delete
              </button>
            )}
          </div>

          <section
            className="rounded-lg border border-line bg-panel px-3 py-2"
            aria-label="Details"
          >
            <h2 className="border-b border-line pb-2 text-sm font-semibold">Details</h2>
            <dl>
              <Detail label="Assignee">
                <select
                  className={fieldClass}
                  aria-label="Assignee"
                  value={task.assignee?.id ?? ''}
                  disabled={!manages}
                  onChange={(e) => set({ assigneeId: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Detail>
              <Detail label="Priority">
                <select
                  className={fieldClass}
                  aria-label="Priority"
                  value={task.priority}
                  disabled={!manages}
                  onChange={(e) => set({ priority: e.target.value })}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </Detail>
              <Detail label="Type">
                <select
                  className={fieldClass}
                  aria-label="Type"
                  value={task.type}
                  disabled={!manages}
                  onChange={(e) => set({ type: e.target.value })}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Detail>
              <Detail label="Sprint">
                <select
                  className={fieldClass}
                  aria-label="Sprint"
                  value={task.sprint?.id ?? ''}
                  disabled={!manages}
                  onChange={(e) => set({ sprintId: e.target.value || null })}
                >
                  <option value="">No sprint (backlog)</option>
                  {sprintChoices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.status !== 'PLANNED'
                        ? ` (${SPRINT_STATUS_LABEL[s.status].toLowerCase()})`
                        : ''}
                    </option>
                  ))}
                </select>
              </Detail>
              <Detail label="Epic">
                <select
                  className={fieldClass}
                  aria-label="Epic"
                  value={task.epic?.id ?? ''}
                  disabled={!manages}
                  onChange={(e) => set({ epicId: e.target.value || null })}
                >
                  <option value="">No epic</option>
                  {epicChoices.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name}
                    </option>
                  ))}
                </select>
              </Detail>
              <Detail label="Labels">
                <LabelInput
                  value={task.labels}
                  onChange={(labels) => set({ labels })}
                  suggestions={labelSuggestions}
                  disabled={!manages}
                />
              </Detail>
              <Detail label="Estimate">
                <input
                  key={`est-${task.estimateHours}`}
                  type="number"
                  min={0}
                  step={1}
                  className={fieldClass}
                  aria-label="Estimate (hours)"
                  defaultValue={task.estimateHours ?? ''}
                  placeholder="Hours"
                  disabled={!manages}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    if (v !== (task.estimateHours === null ? null : est)) set({ estimateHours: v });
                  }}
                />
              </Detail>
              <Detail label="Start">
                <input
                  type="date"
                  className={fieldClass}
                  aria-label="Start"
                  value={task.startDate?.slice(0, 10) ?? ''}
                  disabled={!manages}
                  onChange={(e) => set({ startDate: e.target.value || null })}
                />
              </Detail>
              <Detail label="Due">
                <input
                  type="date"
                  className={`${fieldClass} ${isOverdue(task) ? 'font-semibold text-red' : ''}`}
                  aria-label="Due"
                  value={task.dueDate?.slice(0, 10) ?? ''}
                  min={task.startDate?.slice(0, 10)}
                  disabled={!manages}
                  onChange={(e) => set({ dueDate: e.target.value || null })}
                />
              </Detail>
              <Detail label="Time tracking">
                <div className="flex flex-col gap-1.5 px-2">
                  <span className="tabular-nums">
                    {fmt(task.loggedHours, 1)}h logged
                    {est ? ` of ${fmt(est)}h` : ''}
                  </span>
                  {est > 0 && (
                    <span className="h-1.5 overflow-hidden rounded-sm bg-line">
                      <i
                        className={`block h-full ${task.loggedHours > est ? 'bg-red' : 'bg-teal'}`}
                        style={{ width: `${Math.min(100, (100 * task.loggedHours) / est)}%` }}
                      />
                    </span>
                  )}
                  {works && (
                    <span className="flex gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        className={`${inputClass} w-24`}
                        aria-label="Hours worked today"
                        placeholder="Hours"
                        value={logHours}
                        onChange={(e) => setLogHours(e.target.value)}
                      />
                      <button
                        type="button"
                        className={buttonClass()}
                        disabled={log.isPending || !(Number(logHours) > 0)}
                        onClick={() => log.mutate(Number(logHours))}
                      >
                        Log
                      </button>
                    </span>
                  )}
                </div>
              </Detail>
              <Detail label="Project">
                <Link
                  to={`/projects/${task.project.code}`}
                  className="px-2 text-teal hover:underline"
                >
                  {task.project.code} · {task.project.name}
                </Link>
              </Detail>
            </dl>
          </section>
          <p className="px-1 text-xs text-muted">
            Created {when(task.createdAt)}
            <br />
            Updated {when(task.updatedAt)}
            {task.dueDate && (
              <>
                <br />
                Due {dueLabel(task.dueDate)}
              </>
            )}
          </p>
          {!manages && (
            <p className="px-1 text-xs text-muted">
              {works
                ? 'You can change the status of, log hours on and link tasks assigned to you.'
                : 'View only: an admin or a PM on this project edits this task.'}
            </p>
          )}
        </aside>
        <Toast message={toastMessage} />
      </article>
    </div>
  );
}
