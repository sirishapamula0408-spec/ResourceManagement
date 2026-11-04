import { SedHubMark } from './SignInShell';
import type { ReactNode } from 'react';

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
          <SedHubMark size={24} />
          SedHub
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
