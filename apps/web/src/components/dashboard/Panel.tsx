import type { ReactNode } from 'react';

/** Card with a ruled title bar, as used for every dashboard widget in the prototype. */
export function Panel({
  title,
  note,
  children,
  bodyClassName = '',
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
      <h2 className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm font-semibold">
        {title}
        {note && <span className="text-xs font-normal text-muted">{note}</span>}
      </h2>
      <div className={`px-4 py-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Swatch({ className = '', color }: { className?: string; color?: string }) {
  return (
    <i
      className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-[2px] align-[-1px] ${className}`}
      style={color ? { background: color } : undefined}
    />
  );
}
