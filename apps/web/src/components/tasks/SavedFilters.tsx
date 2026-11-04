import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { buttonClass, errorMessage, inputClass } from '../../lib/forms';
import { EMPTY_FILTER, readFilter, type TaskFilter, writeFilter } from './taskHelpers';

interface SavedFilter {
  id: string;
  name: string;
  projectId: string | null;
  query: string;
}

/**
 * "Saved filters" menu for the Board and Tasks toolbars (M4 JIRA-lite): apply one of your named
 * filters, delete one, or save the current filters under a name. Inside a project space the list
 * is that project's; elsewhere it is for the main pages.
 */
export function SavedFilters({
  filter,
  onApply,
  projectId,
}: {
  filter: TaskFilter;
  onApply: (f: TaskFilter) => void;
  /** Set inside a project space. */
  projectId?: string;
}) {
  const qc = useQueryClient();
  const scoped = !!projectId;
  const queryKey = ['filters', projectId ?? null];
  const { data: saved = [] } = useQuery({
    queryKey,
    queryFn: () =>
      api<SavedFilter[]>(
        `/filters${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
      ),
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const current = writeFilter(filter, scoped).toString();

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      api('/filters', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), projectId: projectId ?? null, query: current }),
      }),
    onSuccess: () => {
      setName('');
      qc.invalidateQueries({ queryKey });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/filters/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const apply = (f: SavedFilter) => {
    const fields = readFilter(new URLSearchParams(f.query));
    onApply({ ...EMPTY_FILTER, ...(scoped ? { projectId, sprintId: '' } : {}), ...fields });
    setOpen(false);
  };
  const active = saved.find((f) => f.query === current);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className={buttonClass()}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        {active ? `Filter: ${active.name}` : 'Saved filters'} ▾
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Saved filters"
          className="absolute top-full right-0 z-30 mt-1 w-72 rounded-md border border-line bg-panel p-2 shadow-lg"
        >
          {saved.length ? (
            <ul className="mb-2 flex flex-col">
              {saved.map((f) => (
                <li key={f.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`flex-1 truncate rounded-[3px] px-2 py-1.5 text-left text-sm hover:bg-btn ${f.id === active?.id ? 'font-semibold text-teal' : ''}`}
                    onClick={() => apply(f)}
                  >
                    {f.name}
                  </button>
                  <button
                    type="button"
                    className="px-1.5 text-muted hover:text-red"
                    aria-label={`Delete filter ${f.name}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(f.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 px-2 py-1 text-xs text-muted">
              No saved filters yet. Set the filters you want, then save them here.
            </p>
          )}
          <form
            className="flex gap-1.5 border-t border-line pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) save.mutate();
            }}
          >
            <input
              className={`${inputClass} min-w-0 flex-1`}
              placeholder="Name this filter"
              aria-label="Filter name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="submit"
              className={buttonClass('primary')}
              disabled={save.isPending || !name.trim()}
            >
              Save
            </button>
          </form>
          {save.error && (
            <p role="alert" className="mt-1.5 px-1 text-xs text-red">
              {errorMessage(save.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
