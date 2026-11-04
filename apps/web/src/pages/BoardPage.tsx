import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { TaskDialog } from '../components/tasks/TaskDialog';
import {
  Avatar,
  EpicChip,
  LabelChips,
  PriorityBadge,
  TaskFilters,
  Toast,
} from '../components/tasks/taskUi';
import {
  applyTaskFilter,
  dueLabel,
  hours,
  isOverdue,
  PRIORITY_RANK,
  STATUS_LABEL,
  TYPE_LABEL,
  useLabels,
  usePlanningLookups,
  useScopedTaskFilter,
  useTaskLookups,
  useToast,
} from '../components/tasks/taskHelpers';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError, TASK_STATUSES, type Project, type Task, type TaskStatus } from '../lib/api';
import { fmt, identityColor } from '../lib/theme';

interface CardProps {
  personNames: string[];
  projectCodes: string[];
  onOpen: (task: Task) => void;
}

function TaskCard({ task, personNames, projectCodes, onOpen }: CardProps & { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const est = hours(task.estimateHours);
  const progress = est ? Math.min(100, (task.loggedHours / est) * 100) : 0;
  const late = isOverdue(task);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task)}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        borderLeftColor: identityColor(task.project.code, projectCodes),
      }}
      className={`block w-full cursor-grab rounded-md border border-l-[3px] border-line bg-panel p-2.5 text-left hover:border-muted ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-semibold">{task.key}</span>
        {task.parent && (
          <span title={`Sub-task of ${task.parent.key} · ${task.parent.title}`}>
            ↳ {task.parent.key}
          </span>
        )}
        <span className="flex-1">{TYPE_LABEL[task.type]}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      <div className="mt-1 mb-2 font-medium">{task.title}</div>
      {(task.epic || task.labels.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {task.epic && <EpicChip epic={task.epic} />}
          <LabelChips labels={task.labels} />
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Avatar name={task.assignee?.name ?? null} allNames={personNames} size={22} />
        <span className="flex-1">{task.project.code}</span>
        {task.commentCount > 0 && (
          <span
            className="inline-flex items-center gap-1"
            title={`${task.commentCount} ${task.commentCount === 1 ? 'comment' : 'comments'}`}
          >
            <svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
            </svg>
            {task.commentCount}
          </span>
        )}
        <span>
          {fmt(task.loggedHours)}/{fmt(est)}h
        </span>
        {task.dueDate && (
          <span className={late ? 'font-semibold text-red' : ''}>{dueLabel(task.dueDate)}</span>
        )}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-sm bg-line">
        <i className="block h-full bg-teal" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  ...cardProps
}: CardProps & {
  status: TaskStatus;
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const total = tasks.reduce((s, t) => s + hours(t.estimateHours), 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABEL[status]}
      className={`flex min-h-[200px] flex-col rounded-lg border border-line bg-panel2 ${isOver ? 'outline-2 -outline-offset-4 outline-teal outline-dashed' : ''}`}
    >
      <header className="flex justify-between px-3 py-2.5 text-[13px] font-semibold text-muted">
        <b className="text-ink">
          {STATUS_LABEL[status]} <span className="font-medium text-muted">{tasks.length}</span>
        </b>
        <span>{fmt(total)}h</span>
      </header>
      <div className="flex min-h-[60px] flex-1 flex-col gap-2 px-2 pb-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length ? (
            tasks.map((t) => <TaskCard key={t.id} task={t} {...cardProps} />)
          ) : (
            <p className="p-2.5 text-center text-xs text-muted">Drop tasks here</p>
          )}
        </SortableContext>
      </div>
    </section>
  );
}

/** Cards in a column: by rank (drag to reorder), then highest priority, then earliest due date. */
const byBoardOrder = (a: Task, b: Task) =>
  a.order - b.order ||
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
  a.number - b.number;

interface Move {
  id: string;
  status: TaskStatus;
  /** The cards it lands between (null = top / bottom of the column). */
  afterId: string | null;
  beforeId: string | null;
  /** Order to show until the server answers. */
  order: number;
}

/**
 * JIRA-style board wired to PATCH /api/tasks/:id/move (requires sign-in).
 * Drag a card to another column to change its status, or up and down to reorder it.
 * Click a card to open it.
 */
export function BoardPage({ project }: { project?: Project } = {}) {
  const qc = useQueryClient();
  const { sprints, epics } = usePlanningLookups();
  const activeSprint = project
    ? sprints.find((s) => s.projectId === project.id && s.status === 'ACTIVE')
    : undefined;
  const [filter, setFilter] = useScopedTaskFilter(project?.id, activeSprint?.id);
  const [toastMessage, showToast] = useToast();
  const [open, setOpen] = useState<Task | null>(null);
  // A short drag threshold lets a plain click open the card instead of starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { people, projects, personNames, projectCodes } = useTaskLookups();
  const labels = useLabels();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });

  const move = useMutation({
    mutationFn: ({ id, status, afterId, beforeId }: Move) =>
      api(`/tasks/${id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ status, afterId, beforeId }),
      }),
    // Optimistic: move the card now, roll back if the API refuses.
    onMutate: async ({ id, status, order }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const previous = qc.getQueryData<Task[]>(['tasks']);
      qc.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, status, order } : t)),
      );
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['tasks'], ctx.previous);
      showToast(
        e instanceof ApiError && e.status === 401
          ? 'Sign in to move tasks'
          : `Couldn’t move the task: ${e.message}`,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const visible = applyTaskFilter(tasks, filter);
  const columnOf = (status: TaskStatus) =>
    visible.filter((t) => t.status === status).sort(byBoardOrder);

  function onDragEnd(e: DragEndEvent) {
    const task = tasks.find((t) => t.id === e.active.id);
    const overId = e.over?.id;
    if (!task || overId === undefined || overId === task.id) return;
    // Dropped on a column (empty space) or on a card in it.
    const overTask = tasks.find((t) => t.id === overId);
    const status = overTask ? overTask.status : (overId as TaskStatus);

    let cards: Task[];
    if (status === task.status) {
      const column = columnOf(status);
      const from = column.findIndex((t) => t.id === task.id);
      const to = overTask ? column.findIndex((t) => t.id === overTask.id) : column.length - 1;
      if (from === to) return;
      cards = arrayMove(column, from, to);
    } else {
      // From another column: in front of the card it was dropped on, else at the bottom.
      const column = columnOf(status);
      const at = overTask ? column.findIndex((t) => t.id === overTask.id) : column.length;
      cards = [...column.slice(0, at), task, ...column.slice(at)];
    }
    const i = cards.findIndex((t) => t.id === task.id);
    const after = cards[i - 1] ?? null;
    const before = cards[i + 1] ?? null;
    const order =
      after && before
        ? (after.order + before.order) / 2
        : after
          ? after.order + 1000
          : before
            ? before.order - 1000
            : 0;
    move.mutate(
      { id: task.id, status, afterId: after?.id ?? null, beforeId: before?.id ?? null, order },
      {
        onSuccess: () =>
          showToast(
            status === task.status
              ? `${task.key} reordered`
              : `${task.key} moved to ${STATUS_LABEL[status]}`,
          ),
      },
    );
  }

  return (
    <>
      <PageHeader
        title={
          project
            ? activeSprint && filter.sprintId === activeSprint.id
              ? activeSprint.name
              : 'Board'
            : 'Board'
        }
        subtitle={
          project && activeSprint && filter.sprintId === activeSprint.id
            ? (activeSprint.goal ?? undefined)
            : undefined
        }
      >
        <TaskFilters
          showProject={!project}
          filter={filter}
          onChange={setFilter}
          people={people}
          projects={projects}
          sprints={sprints}
          epics={epics}
          labels={labels}
        />
      </PageHeader>
      {isLoading ? (
        <p className="p-2.5 text-center text-xs text-muted">Loading…</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-[repeat(6,minmax(240px,1fr))] items-start gap-3 overflow-x-auto pb-2">
            {TASK_STATUSES.map((s) => (
              <Column
                key={s}
                status={s}
                tasks={columnOf(s)}
                personNames={personNames}
                projectCodes={projectCodes}
                onOpen={setOpen}
              />
            ))}
          </div>
        </DndContext>
      )}
      <Toast message={toastMessage} />
      {open && (
        <TaskDialog
          key={open.id}
          task={open}
          onClose={() => setOpen(null)}
          onSaved={showToast}
          onOpenTask={setOpen}
        />
      )}
    </>
  );
}
