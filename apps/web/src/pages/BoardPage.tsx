import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { api, TASK_STATUSES, type Task, type TaskStatus } from '../lib/api';

function TaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : {};
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded border border-slate-200 bg-white p-3 text-sm shadow-sm"
    >
      <div className="text-xs text-slate-400">{task.project.code}</div>
      <div className="font-medium">{task.title}</div>
      <div className="mt-1 text-xs text-slate-500">{task.assignee?.name ?? 'Unassigned'}</div>
    </div>
  );
}

function Column({ status, tasks }: { status: TaskStatus; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col gap-2 rounded-lg p-3 ${isOver ? 'bg-indigo-50' : 'bg-slate-100'}`}
    >
      <div className="mb-1 text-xs font-semibold text-slate-600">
        {status.replace('_', ' ')} <span className="text-slate-400">({tasks.length})</span>
      </div>
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
  );
}

/**
 * Minimal drag-and-drop board wired to PATCH /api/tasks/:id/move (requires sign-in).
 * TODO(M1): in-column sorting (@dnd-kit/sortable), project filter, optimistic updates, task drawer.
 */
export function BoardPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<Task[]>('/tasks'),
  });
  const move = useMutation({
    mutationFn: ({ id, status, order }: { id: string; status: TaskStatus; order: number }) =>
      api(`/tasks/${id}/move`, { method: 'PATCH', body: JSON.stringify({ status, order }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (e) => alert(`Move failed: ${e.message}`),
  });

  function onDragEnd(e: DragEndEvent) {
    const status = e.over?.id as TaskStatus | undefined;
    const task = tasks.find((t) => t.id === e.active.id);
    if (!status || !task || task.status === status) return;
    const maxOrder = Math.max(0, ...tasks.filter((t) => t.status === status).map((t) => t.order));
    move.mutate({ id: task.id, status, order: maxOrder + 1000 });
  }

  return (
    <>
      <PageHeader title="Board" subtitle="Drag cards between columns (sign in first)." />
      {isLoading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        <DndContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {TASK_STATUSES.map((s) => (
              <Column key={s} status={s} tasks={tasks.filter((t) => t.status === s)} />
            ))}
          </div>
        </DndContext>
      )}
    </>
  );
}
