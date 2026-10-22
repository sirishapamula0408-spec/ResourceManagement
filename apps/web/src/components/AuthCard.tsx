import type { ReactNode } from 'react';

/** Three rising bars: the Resource Board mark from the prototype. */
export function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="12" width="5" height="9" rx="1" fill="var(--color-amber)" />
      <rect x="8.5" y="6" width="5" height="15" rx="1" fill="var(--color-teal)" />
      <rect x="16" y="1" width="5" height="20" rx="1" fill="var(--color-ink)" />
    </svg>
  );
}

/** Centred card used by the sign-in and change-password pages. */
export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-[10px] border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]">
        <div className="flex items-center gap-2.5 border-b border-line px-5 py-4 text-base font-bold tracking-tight">
          <BrandMark />
          Resource Board
        </div>
        <div className="px-5 py-5">
          <h1 className="mb-1 text-lg font-semibold">{title}</h1>
          {intro && <p className="mb-4 text-muted">{intro}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
