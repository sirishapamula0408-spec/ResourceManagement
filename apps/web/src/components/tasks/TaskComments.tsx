import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, auth, isViewer, type TaskComment } from '../../lib/api';
import { buttonClass, errorMessage, inputClass } from '../../lib/forms';
import { Avatar } from './taskUi';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Comment thread for one task (M4 JIRA-lite), oldest first. Comments save straight away,
 * separately from the task's Save button. You can edit or delete your own; admins can delete any.
 */
export function TaskComments({ taskId, personNames }: { taskId: string; personNames: string[] }) {
  const qc = useQueryClient();
  const me = auth.getUser();
  // Viewers read the thread but don't comment (the API refuses it too).
  const canWrite = !isViewer();
  const queryKey = ['comments', taskId];
  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api<TaskComment[]>(`/tasks/${taskId}/comments`),
  });
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  const changed = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ['tasks'] }); // comment counts on cards
  };
  const add = useMutation({
    mutationFn: (body: string) =>
      api(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: (_r, body) => {
      // Keep anything typed while the comment was saving.
      setDraft((d) => (d === body ? '' : d));
      changed();
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api(`/tasks/${taskId}/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setEditing(null);
      changed();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/tasks/${taskId}/comments/${id}`, { method: 'DELETE' }),
    onSuccess: changed,
  });
  const error = add.error ?? edit.error ?? remove.error;
  const post = () => draft.trim() && add.mutate(draft);

  return (
    <section className="flex flex-col gap-2.5 sm:col-span-2" aria-label="Comments">
      <h4 className="text-xs font-medium text-muted">
        Comments{comments.length ? ` · ${comments.length}` : ''}
      </h4>
      {isLoading && <p className="text-xs text-muted">Loading…</p>}
      <ol className="flex flex-col gap-2.5">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <Avatar name={c.author.name} allNames={personNames} size={26} />
            <div className="min-w-0 flex-1 rounded-md bg-panel2 px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <b className="text-ink">{c.author.name}</b>
                <span className="text-muted">
                  {when(c.createdAt)}
                  {c.updatedAt !== c.createdAt ? ' · edited' : ''}
                </span>
                <span className="flex-1" />
                {canWrite && c.authorId === me?.id && editing?.id !== c.id && (
                  <button
                    type="button"
                    className="text-muted hover:text-ink"
                    onClick={() => setEditing({ id: c.id, body: c.body })}
                  >
                    Edit
                  </button>
                )}
                {canWrite && (c.authorId === me?.id || me?.role === 'ADMIN') && (
                  <button
                    type="button"
                    className="text-muted hover:text-red"
                    disabled={remove.isPending}
                    onClick={() => window.confirm('Delete this comment?') && remove.mutate(c.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
              {editing?.id === c.id ? (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  <textarea
                    className={inputClass}
                    rows={2}
                    aria-label="Edit comment"
                    value={editing.body}
                    onChange={(e) => setEditing({ id: c.id, body: e.target.value })}
                  />
                  <span className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      className={buttonClass()}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={buttonClass('primary')}
                      disabled={edit.isPending || !editing.body.trim()}
                      onClick={() => edit.mutate(editing)}
                    >
                      Save comment
                    </button>
                  </span>
                </div>
              ) : (
                <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink">{c.body}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {canWrite && (
        <div className="flex flex-col gap-1.5">
          <textarea
            className={inputClass}
            rows={2}
            placeholder="Add a comment"
            aria-label="Add a comment"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter posts, like JIRA.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                post();
              }
            }}
          />
          <span className="flex items-center justify-end gap-2">
            {error && (
              <span role="alert" className="flex-1 text-xs text-red">
                {errorMessage(error)}
              </span>
            )}
            <button
              type="button"
              className={buttonClass()}
              disabled={add.isPending || !draft.trim()}
              onClick={post}
            >
              {add.isPending ? 'Posting…' : 'Comment'}
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
