import { type ReactNode, useEffect, useRef, useState } from 'react';
import { buttonClass, inputClass } from '../lib/forms';

/**
 * Modal dialog with a header, a two-column form body and Save / Cancel / Delete actions,
 * matching the prototype's task, person and project dialogs.
 */
export function Dialog({
  title,
  children,
  onClose,
  onSave,
  onDelete,
  deleteLabel = 'Delete',
  deleteConfirm,
  saving = false,
  error,
  readOnly = false,
  notice,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  /** Asked with confirm() before onDelete runs. */
  deleteConfirm?: string;
  saving?: boolean;
  error?: string | null;
  /** View only: no Save button; Cancel reads "Close". */
  readOnly?: boolean;
  /** Muted line above the actions, e.g. why some fields are locked. */
  notice?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(640px,94vw)] rounded-[10px] border border-line bg-panel p-0 text-ink backdrop:bg-[rgba(10,15,25,0.45)]"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className="flex items-center justify-between border-b border-line px-[18px] py-3.5">
          <h3 className="m-0 text-base font-semibold">{title}</h3>
          <button type="button" className={buttonClass()} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto px-[18px] py-4 sm:grid-cols-2">
          {children}
        </div>
        {error && (
          <p role="alert" className="mx-[18px] mb-3 rounded-md bg-red-soft px-3 py-2 text-red">
            {error}
          </p>
        )}
        {notice && <p className="mx-[18px] mb-3 text-xs text-muted">{notice}</p>}
        <div className="flex gap-2 border-t border-line px-[18px] py-3">
          {onDelete && !readOnly && (
            <button
              type="button"
              className={`${buttonClass()} text-red`}
              disabled={saving}
              onClick={() => {
                if (!deleteConfirm || window.confirm(deleteConfirm)) onDelete();
              }}
            >
              {deleteLabel}
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className={buttonClass()} onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button type="submit" className={buttonClass('primary')} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

export function Field({
  label,
  full = false,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs font-medium text-muted ${full ? 'sm:col-span-2' : ''}`}
    >
      {label}
      {children}
    </label>
  );
}

/** Searchable checkbox list, used to map people to projects and projects to people. */
export function Checklist({
  label,
  options,
  selected,
  onChange,
  empty = 'Nothing to choose from yet.',
}: {
  label: string;
  options: { id: string; label: string; hint?: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  empty?: string;
}) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) =>
    `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <fieldset className="flex flex-col gap-1.5 text-xs font-medium text-muted sm:col-span-2">
      <legend className="mb-1">
        {label} <span className="font-normal">· {selected.length} selected</span>
      </legend>
      {options.length > 6 && (
        <input
          type="search"
          className={inputClass}
          placeholder="Filter"
          aria-label={`Filter ${label.toLowerCase()}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className="max-h-52 overflow-y-auto rounded-md border border-line">
        {options.length === 0 && <p className="p-2.5 text-center">{empty}</p>}
        {shown.map((o) => (
          <label
            key={o.id}
            className="flex cursor-pointer items-center gap-2 border-b border-line px-2.5 py-1.5 text-sm font-normal text-ink last:border-b-0 hover:bg-panel2"
          >
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={() => toggle(o.id)}
            />
            <span className="flex-1">{o.label}</span>
            {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
