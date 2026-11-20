import { useEffect, useRef, useState } from 'react';
import { buttonClass } from '../lib/forms';

export interface DownloadOption<K extends string> {
  key: K;
  label: string;
  hint?: string;
}

/** A "Download ▾" button whose menu lists the file formats to download. */
export function DownloadMenu<K extends string>({
  options,
  onSelect,
  busy = false,
  label = 'Download',
  title,
}: {
  options: DownloadOption<K>[];
  onSelect: (key: K) => void;
  busy?: boolean;
  label?: string;
  /** Tooltip describing what is downloaded. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className={buttonClass()}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? 'Preparing…' : label} ▾
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute top-full right-0 z-30 mt-1 w-56 rounded-md border border-line bg-panel p-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitem"
              className="flex w-full flex-col rounded-[3px] px-2.5 py-1.5 text-left text-sm hover:bg-btn"
              onClick={() => {
                setOpen(false);
                onSelect(o.key);
              }}
            >
              {o.label}
              {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
