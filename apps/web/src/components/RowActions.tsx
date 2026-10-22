const iconButton =
  'inline-grid h-7 w-7 place-items-center rounded-md border border-line bg-panel hover:bg-panel2 disabled:opacity-60';

const svgProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function PencilIcon() {
  return (
    <svg {...svgProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg {...svgProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...svgProps}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/**
 * Icon buttons for a table row: pencil (edit), eye (view only) and a red trash can (delete).
 * The label doubles as the tooltip and the accessible name. Clicks don't bubble to the row,
 * and delete asks for confirmation first.
 */
export function RowActions({
  onEdit,
  onDelete,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  deleteConfirm,
  busy = false,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  /** "View" shows an eye instead of a pencil. */
  editLabel?: string;
  deleteLabel?: string;
  deleteConfirm?: string;
  busy?: boolean;
}) {
  return (
    <div className="flex justify-end gap-1.5 whitespace-nowrap">
      {onEdit && (
        <button
          type="button"
          className={`${iconButton} text-ink`}
          aria-label={editLabel}
          title={editLabel}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          {editLabel === 'View' ? <EyeIcon /> : <PencilIcon />}
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className={`${iconButton} text-red hover:border-red hover:bg-red-soft`}
          aria-label={deleteLabel}
          title={deleteLabel}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            if (!deleteConfirm || window.confirm(deleteConfirm)) onDelete();
          }}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
