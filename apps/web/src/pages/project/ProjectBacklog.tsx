import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { TaskDialog } from '../../components/tasks/TaskDialog';
import {
  Avatar,
  EpicChip,
  LabelChips,
  PriorityBadge,
  StatusPill,
  Toast,
} from '../../components/tasks/taskUi';
import {
  dueLabel,
  hours,
  PRIORITY_RANK,
  SPRINT_STATUS_LABEL,
  TYPE_LABEL,
  usePlanningLookups,
  useTaskLookups,
  useTaskPermissions,
  useToast,
} from '../../components/tasks/taskHelpers';
import { api, type Sprint, type Task, type TaskStatus } from '../../lib/api';
import { buttonClass, errorMessage, inputClass } from '../../lib/forms';
import { fmt } from '../../lib/theme';
import { SprintDialog } from '../SprintsPage';
import { SPRINT_STATUS_CLASS } from '../../lib/statusStyles';
import { useProject } from './useProject';

const BACKLOG = 'backlog';
const QUERIES = [['tasks'], ['sprints'], ['epics'], ['dashboard']];

/** Rank, then priority: the order rows show in a sprint or the backlog. */
const byRank = (a: Task, b: Task) =>
  a.order - b.order || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.number - b.number;

interface RowProps {
  task: Task;
  canMove: boolean;
  targets: { id: string; label: string }[];
  personNames: string[];
  onOpen: (t: Task) => void;
  onMove: (t: Task, target: string) => void;
}

function BacklogRow({ task, canMove, targets, personNames, onOpen, onMove }: RowProps) {
  // Pointer dragging only: the Move to menu is the keyboard and screen reader route, so the row
  // stays a plain list item (no button role around the link and the menu).
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canMove,
  });
  const here = task.sprint?.id ?? BACKLOG;
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
      className={`flex items-center gap-2.5 border-b border-line bg-panel px-3 py-2 text-sm last:border-b-0 hover:bg-panel2 ${canMove ? 'cursor-grab' : ''} ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
    >
      <span className="w-14 shrink-0 text-xs text-muted">{TYPE_LABEL[task.type]}</span>
      <span className="shrink-0 text-xs font-semibold text-muted">{task.key}</span>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:text-teal hover:underline"
        onClick={() => onOpen(task)}
      >
        {task.title}
      </button>
      <span className="hidden items-center gap-1 lg:inline-flex">
        {task.epic && <EpicChip epic={task.epic} />}
        <LabelChips labels={task.labels} max={2} />
      </span>
      <PriorityBadge priority={task.priority} />
      <StatusPill status={task.status} />
      <span className="w-10 text-right text-xs text-muted tabular-nums">
        {fmt(hours(task.estimateHours))}h
      </span>
      <Avatar name={task.assignee?.name ?? null} allNames={personNames} size={22} />
      {canMove && (
        <select
          className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-xs"
          aria-label={`Move ${task.key} to`}
          value={here}
          // Keep the drag sensor out of the menu.
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onMove(task, e.target.value)}
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

function Section({
  id,
  title,
  meta,
  actions,
  tasks,
  children,
  rowProps,
}: {
  id: string;
  title: React.ReactNode;
  meta: React.ReactNode;
  actions?: React.ReactNode;
  tasks: Task[];
  children?: React.ReactNode;
  rowProps: Omit<RowProps, 'task'>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const estimate = tasks.reduce((s, t) => s + hours(t.estimateHours), 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={typeof title === 'string' ? title : undefined}
      className={`mb-4 rounded-lg border border-line bg-panel2 ${isOver ? 'outline-2 -outline-offset-2 outline-teal outline-dashed' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-xs text-muted">
          {meta}
          {meta ? ' · ' : ''}
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} · {fmt(estimate)}h
        </span>
        <span className="flex-1" />
        {actions}
      </header>
      <ul className="border-t border-line">
        {tasks.map((t) => (
          <BacklogRow key={t.id} task={t} {...rowProps} />
        ))}
        {!tasks.length && (
          <li className="px-3 py-3 text-center text-xs text-muted">
            {rowProps.canMove ? 'Drag tasks here, or use a task’s Move to menu.' : 'No tasks.'}
          </li>
        )}
      </ul>
      {children}
    </section>
  );
}

/** Quick "create task" line at the bottom of a sprint or the backlog. */
function QuickCreate({
  projectId,
  sprintId,
  onCreated,
}: {
  projectId: string;
  sprintId: string | null;
  onCreated: (title: string) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: (summary: string) =>
      api('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          sprintId,
          title: summary,
          // Unplanned work waits in Backlog; work in a sprint is ready To do.
          status: (sprintId ? 'TODO' : 'BACKLOG') satisfies TaskStatus,
        }),
      }),
    onSuccess: (_r, summary) => {
      setTitle((t) => (t === summary ? '' : t));
      QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      onCreated(summary);
    },
  });
  const submit = () => title.trim() && create.mutate(title.trim());
  return (
    <div className="flex gap-2 border-t border-line px-3 py-2">
      <input
        className={`${inputClass} flex-1`}
        placeholder="+ Create task: type a summary and press Enter"
        aria-label={sprintId ? 'Create a task in this sprint' : 'Create a task in the backlog'}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      {create.error && (
        <span role="alert" className="self-center text-xs text-red">
          {errorMessage(create.error)}
        </span>
      )}
    </div>
  );
}

/**
 * JIRA-style backlog for one project: the active and planned sprints, then the backlog (tasks in
 * no sprint that are not done). Managers drag tasks between them or use a task's Move to menu,
 * create tasks in place, and start or complete sprints.
 */
export function ProjectBacklog() {
  const project = useProject();
  const qc = useQueryClient();
  const [toastMessage, showToast] = useToast();
  const [open, setOpen] = useState<Task | null>(null);
  const [editingSprint, setEditingSprint] = useState<Sprint | 'new' | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { personNames } = useTaskLookups();
  const { sprints } = usePlanningLookups();
  const { canManageProject } = useTaskPermissions();
  const manages = canManageProject(project.id);
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  const tasks = allTasks.filter((t) => t.project.id === project.id);

  const rank: Record<Sprint['status'], number> = { ACTIVE: 0, PLANNED: 1, CLOSED: 2 };
  const openSprints = sprints
    .filter((s) => s.projectId === project.id && s.status !== 'CLOSED')
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999'),
    );
  const hasActive = openSprints.some((s) => s.status === 'ACTIVE');
  const backlog = tasks.filter((t) => !t.sprint && t.status !== 'DONE').sort(byRank);
  const targets = [
    ...openSprints.map((s) => ({ id: s.id, label: s.name })),
    { id: BACKLOG, label: 'Backlog' },
  ];

  const refresh = () => QUERIES.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  const move = useMutation({
    mutationFn: ({ task, target }: { task: Task; target: string }) =>
      api(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          sprintId: target === BACKLOG ? null : target,
          // Planned into a sprint: ready to do.
          ...(target !== BACKLOG && task.status === 'BACKLOG' ? { status: 'TODO' } : {}),
        }),
      }),
    onSuccess: (_r, { task, target }) => {
      refresh();
      showToast(`${task.key} moved to ${targets.find((t) => t.id === target)?.label}`);
    },
    onError: (e) => showToast(errorMessage(e)),
  });
  const onMove = (task: Task, target: string) => {
    if ((task.sprint?.id ?? BACKLOG) !== target) move.mutate({ task, target });
  };
  const setStatus = useMutation({
    mutationFn: ({ sprint, status }: { sprint: Sprint; status: Sprint['status'] }) =>
      api(`/sprints/${sprint.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: (_r, { sprint, status }) => {
      refresh();
      showToast(
        status === 'ACTIVE'
          ? `${sprint.name} started`
          : `${sprint.name} complete. Unfinished tasks went back to the backlog.`,
      );
    },
    onError: (e) => showToast(errorMessage(e)),
  });

  function onDragEnd(e: DragEndEvent) {
    const task = tasks.find((t) => t.id === e.active.id);
    if (task && e.over) onMove(task, String(e.over.id));
  }

  const rowProps = { canMove: manages, targets, personNames, onOpen: setOpen, onMove };
  const created = (title: string) => showToast(`Created “${title}”`);

  return (
    <>
      <PageHeader title="Backlog">
        {manages && (
          <button
            type="button"
            className={buttonClass('primary')}
            onClick={() => setEditingSprint('new')}
          >
            Create sprint
          </button>
        )}
      </PageHeader>
      {isLoading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {openSprints.map((s) => {
            const inSprint = tasks.filter((t) => t.sprint?.id === s.id).sort(byRank);
            return (
              <Section
                key={s.id}
                id={s.id}
                title={s.name}
                meta={
                  <>
                    <span
                      className={`mr-1.5 rounded-[3px] px-[7px] py-0.5 text-[11px] font-semibold text-ink ${SPRINT_STATUS_CLASS[s.status]}`}
                    >
                      {SPRINT_STATUS_LABEL[s.status]}
                    </span>
                    {s.startDate && dueLabel(s.startDate)}
                    {s.endDate && ` – ${dueLabel(s.endDate)}`}
                    {s.goal && ` · ${s.goal}`}
                  </>
                }
                tasks={inSprint}
                rowProps={rowProps}
                actions={
                  manages && (
                    <span className="flex gap-1.5">
                      {s.status === 'PLANNED' && (
                        <button
                          type="button"
                          className={buttonClass()}
                          disabled={hasActive || setStatus.isPending}
                          title={hasActive ? 'Complete the active sprint first' : undefined}
                          onClick={() => setStatus.mutate({ sprint: s, status: 'ACTIVE' })}
                        >
                          Start sprint
                        </button>
                      )}
                      {s.status === 'ACTIVE' && (
                        <button
                          type="button"
                          className={buttonClass()}
                          disabled={setStatus.isPending}
                          onClick={() => {
                            const left = inSprint.filter((t) => t.status !== 'DONE').length;
                            if (
                              window.confirm(
                                `Complete ${s.name}? ${left} unfinished ${left === 1 ? 'task goes' : 'tasks go'} back to the backlog.`,
                              )
                            ) {
                              setStatus.mutate({ sprint: s, status: 'CLOSED' });
                            }
                          }}
                        >
                          Complete sprint
                        </button>
                      )}
                      <button
                        type="button"
                        className={buttonClass()}
                        onClick={() => setEditingSprint(s)}
                      >
                        Edit
                      </button>
                    </span>
                  )
                }
              >
                {manages && (
                  <QuickCreate projectId={project.id} sprintId={s.id} onCreated={created} />
                )}
              </Section>
            );
          })}
          <Section
            id={BACKLOG}
            title="Backlog"
            meta={openSprints.length ? '' : 'No open sprints yet'}
            tasks={backlog}
            rowProps={rowProps}
          >
            {manages && <QuickCreate projectId={project.id} sprintId={null} onCreated={created} />}
          </Section>
        </DndContext>
      )}
      {editingSprint && (
        <SprintDialog
          sprint={editingSprint === 'new' ? null : editingSprint}
          projectId={project.id}
          onClose={() => setEditingSprint(null)}
        />
      )}
      {open && (
        <TaskDialog
          key={open.id}
          task={open}
          onClose={() => setOpen(null)}
          onSaved={showToast}
          onOpenTask={setOpen}
        />
      )}
      <Toast message={toastMessage} />
    </>
  );
}
