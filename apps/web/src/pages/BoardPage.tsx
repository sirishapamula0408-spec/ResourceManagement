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
import { TaskDialog } from '../components/tasks/TaskDialog';
import { Avatar, PriorityBadge, TaskFilters, Toast } from '../components/tasks/taskUi';
import {
  applyTaskFilter,
  dueLabel,
  hours,
  isOverdue,
  PRIORITY_RANK,
  STATUS_LABEL,
  TYPE_LABEL,
  useTaskFilter,
  useTaskLookups,
  useToast,
} from '../components/tasks/taskHelpers';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError, TASK_STATUSES, type Task, type TaskStatus } from '../lib/api';
import { fmt, identityColor } from '../lib/theme';

interface CardProps {
  personNames: string[];
  projectCodes: string[];
  onOpen: (task: Task) => void;
}

function TaskCard({ task, personNames, projectCodes, onOpen }: CardProps & { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
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
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        borderLeftColor: identityColor(task.project.code, projectCodes),
      }}
      className={`block w-full cursor-grab rounded-md border border-l-[3px] border-line bg-panel p-2.5 text-left hover:border-muted ${isDragging ? 'relative z-10 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="font-semibold">{task.key}</span>
        <span className="flex-1">{TYPE_LABEL[task.type]}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      <div className="mt-1 mb-2 font-medium">{task.title}</div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Avatar name={task.assignee?.name ?? null} allNames={personNames} size={22} />
        <span className="flex-1">{task.project.code}</span>
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
        {tasks.length ? (
          tasks.map((t) => <TaskCard key={t.id} task={t} {...cardProps} />)
        ) : (
          <p className="p-2.5 text-center text-xs text-muted">Drop tasks here</p>
        )}
      </div>
    </section>
  );
}

/** Cards in a column: highest priority first, then earliest due date. */
const byPriorityThenDue = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');

/**
 * JIRA-style board wired to PATCH /api/tasks/:id/move (requires sign-in).
 * Click a card to open it. TODO(M1): in-column reordering (@dnd-kit/sortable).
 */
export function BoardPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useTaskFilter();
  const [toastMessage, showToast] = useToast();
  const [open, setOpen] = useState<Task | null>(null);
  // A short drag threshold lets a plain click open the card instead of starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { people, projects, personNames, projectCodes } = useTaskLookups();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });

  const move = useMutation({
    mutationFn: ({ id, status, order }: { id: string; status: TaskStatus; order: number }) =>
      api(`/tasks/${id}/move`, { method: 'PATCH', body: JSON.stringify({ status, order }) }),
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

  function onDragEnd(e: DragEndEvent) {
    const status = e.over?.id as TaskStatus | undefined;
    const task = tasks.find((t) => t.id === e.active.id);
    if (!status || !task || task.status === status) return;
    const maxOrder = Math.max(0, ...tasks.filter((t) => t.status === status).map((t) => t.order));
    move.mutate(
      { id: task.id, status, order: maxOrder + 1000 },
      { onSuccess: () => showToast(`${task.key} moved to ${STATUS_LABEL[status]}`) },
    );
  }

  const visible = applyTaskFilter(tasks, filter);

  return (
    <>
      <PageHeader title="Board">
        <TaskFilters filter={filter} onChange={setFilter} people={people} projects={projects} />
      </PageHeader>
      {isLoading ? (
        <p className="p-2.5 text-center text-xs text-muted">Loading…</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-[repeat(6,minmax(240px,1fr))] items-start gap-3 overflow-x-auto pb-2">
            {TASK_STATUSES.map((s) => (
              <Column
                key={s}
                status={s}
                tasks={visible.filter((t) => t.status === s).sort(byPriorityThenDue)}
                personNames={personNames}
                projectCodes={projectCodes}
                onOpen={setOpen}
              />
            ))}
          </div>
        </DndContext>
      )}
      <Toast message={toastMessage} />
      {open && <TaskDialog task={open} onClose={() => setOpen(null)} onSaved={showToast} />}
    </>
  );
}
