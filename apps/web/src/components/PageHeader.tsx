import type { ReactNode } from 'react';

/** Page title row; filters and actions sit beside the title, as in the prototype toolbar. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-center gap-2.5">
      <h1 className="mr-3 text-xl font-bold tracking-tight">{title}</h1>
      {children}
      {subtitle && <p className="ml-auto text-xs text-muted">{subtitle}</p>}
    </header>
  );
}
