import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api, ROLE_LABEL, type Portfolio, type Project, type Role } from '../lib/api';
import { buttonClass } from '../lib/forms';
import { identityColor } from '../lib/theme';
import { SedHubMark } from './SignInShell';

/**
 * The app's left navigation, laid out like the prototype (Prototype/screens/Portfolio.png):
 * brand, the main views with icons, the user's projects (with a health badge when it isn't on
 * track), what finishes next, the next promised date, and the signed-in user at the bottom.
 * The portfolio parts only show for roles that can see the portfolio.
 */

export interface NavItem {
  to: string;
  label: string;
}

// ---- Icons (16px, stroke) ----
const svg = (path: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
);
const ICONS: Record<string, ReactNode> = {
  '/dashboard': svg(
    <>
      <path d="M3 12a9 9 0 1 1 18 0" />
      <path d="M12 12l4-4" />
      <path d="M3 16h18" />
    </>,
  ),
  '/portfolio': svg(
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>,
  ),
  '/projects': svg(
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  ),
  '/teams': svg(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </>,
  ),
  '/reports': svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>,
  ),
  '/leads': svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>,
  ),
  '/audit': svg(
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
};

const navLink = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg border px-3 py-1.5 text-[14px] ${
    isActive
      ? 'border-line bg-panel font-medium text-ink shadow-sm'
      : 'border-transparent text-muted hover:bg-panel hover:text-ink'
  }`;

const heading =
  'mt-4 mb-1 flex items-center justify-between px-3 text-xs tracking-[0.12em] text-muted uppercase';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shortDay = (iso: string) =>
  toDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDay = (iso: string) =>
  toDate(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: toDate(iso).getUTCFullYear() === new Date().getUTCFullYear() ? undefined : 'numeric',
    timeZone: 'UTC',
  });

/** "today", "tomorrow", "in 5 days", "in 3 weeks", "in 4 months". */
function fromNow(iso: string, today: string) {
  const days = Math.round((toDate(iso).getTime() - toDate(today).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/** How many active projects the sidebar lists; the rest are a click away. */
const SIDEBAR_PROJECTS = 2;

const RAG_BADGE = {
  amber: { label: 'At risk', className: 'bg-amber-soft text-amber' },
  red: { label: 'Off track', className: 'bg-red-soft text-red' },
};

export function AppSidebar({
  nav,
  role,
  name,
  showPortfolio,
  onSignOut,
  onNavigate,
}: {
  nav: NavItem[];
  role: Role | undefined;
  name: string;
  /** The role can see the portfolio (its counts, health, finishing next, next promise). */
  showPortfolio: boolean;
  onSignOut: () => void;
  /** Called after a link is followed (closes the sidebar on small screens). */
  onNavigate?: () => void;
}) {
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
    enabled: role !== undefined,
  });
  // Same key as the Portfolio page's default view, so the two share one request.
  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', '', false],
    queryFn: () => api<Portfolio>('/portfolio?'),
    enabled: showPortfolio,
  });

  const health = new Map(portfolio?.projects.map((r) => [r.project.id, r]) ?? []);
  const codes = projects.map((p) => p.code);
  // Active projects only; the ones needing attention (off track, then at risk) first.
  const RAG_ORDER = { red: 0, amber: 1, green: 2 };
  const activeProjects = projects
    .filter((p) => p.status === 'ACTIVE')
    .sort(
      (a, b) =>
        RAG_ORDER[health.get(a.id)?.health.rag ?? 'green'] -
          RAG_ORDER[health.get(b.id)?.health.rag ?? 'green'] || a.name.localeCompare(b.name),
    );
  const shownProjects = activeProjects.slice(0, SIDEBAR_PROJECTS);
  const asOf = portfolio?.asOf ?? new Date().toISOString().slice(0, 10);
  const planned = (portfolio?.projects ?? []).filter(
    (r) => r.forecast.state === 'late' || r.forecast.state === 'on_time',
  );
  const finishingNext = [...planned]
    .sort((a, b) => a.forecast.finish!.localeCompare(b.forecast.finish!))
    .slice(0, 4);
  const nextPromise = (portfolio?.projects ?? [])
    .filter(
      (r) => r.forecast.promised && r.forecast.promised >= asOf && r.forecast.state !== 'done',
    )
    .sort((a, b) => a.forecast.promised!.localeCompare(b.forecast.promised!))[0];

  return (
    <div className="flex h-full flex-col px-3 py-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
        <Link
          to="/"
          onClick={onNavigate}
          className="mb-3 flex items-center gap-3 rounded-lg px-2 py-1"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-panel shadow-sm ring-1 ring-line">
            <SedHubMark size={26} />
          </span>
          <span className="leading-tight">
            <span className="block text-[17px] font-semibold text-ink">SedHub</span>
            <span className="block text-[13px] text-muted">{role ? ROLE_LABEL[role] : ''}</span>
          </span>
        </Link>

        <nav aria-label="Views" className="flex flex-col gap-0.5">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLink} onClick={onNavigate}>
              {ICONS[item.to]}
              <span className="flex-1">{item.label}</span>
              {item.to === '/portfolio' && portfolio && (
                <span className="rounded-md border border-line px-1.5 text-xs text-muted tabular-nums">
                  {portfolio.totals.projects}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        {role === 'ADMIN' && (
          <nav aria-label="Admin" className="mt-0.5 flex flex-col">
            <NavLink to="/audit" className={navLink} onClick={onNavigate}>
              {ICONS['/audit']}
              Audit log
            </NavLink>
          </nav>
        )}

        {role !== 'SALES' && activeProjects.length > 0 && (
          <section aria-label="Your projects">
            <h2 className={heading}>
              Projects
              <Link
                to="/projects"
                onClick={onNavigate}
                className="text-base leading-none tracking-normal hover:text-ink"
                title="All projects"
                aria-label="All projects"
              >
                +
              </Link>
            </h2>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {shownProjects.map((p) => {
                const rag = health.get(p.id)?.health.rag;
                const badge = rag === 'amber' || rag === 'red' ? RAG_BADGE[rag] : null;
                return (
                  <li key={p.id}>
                    <NavLink to={`/projects/${p.code}`} className={navLink} onClick={onNavigate}>
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-panel text-[9px] font-bold"
                        style={{ color: identityColor(p.code, codes) }}
                        aria-hidden="true"
                      >
                        {p.code.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {badge && (
                        <span
                          className={`rounded-md px-1.5 py-px text-[11px] font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
            {projects.length > shownProjects.length && (
              <Link
                to="/projects"
                onClick={onNavigate}
                className="mt-1 block px-3 text-[13px] text-muted hover:text-ink"
              >
                View all {projects.length} projects
              </Link>
            )}
          </section>
        )}

        {finishingNext.length > 0 && (
          <section aria-label="Finishing next">
            <h2 className={heading}>
              Finishing next
              <span className="font-mono text-[11px] tracking-normal normal-case">planned</span>
            </h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {finishingNext.map((r) => (
                <li key={r.project.id}>
                  <Link
                    to={`/projects/${r.project.code}`}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-lg px-3 py-1 text-[13px] text-ink hover:bg-panel"
                  >
                    <span className="min-w-0 flex-1 truncate">{r.project.name}</span>
                    <span
                      className={`font-mono text-xs whitespace-nowrap ${r.forecast.state === 'late' ? 'text-red' : 'text-muted'}`}
                    >
                      {shortDay(r.forecast.finish!)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex-1" />

        {nextPromise && (
          <section
            aria-label="Next promise"
            className="mt-4 overflow-hidden [@media(max-height:800px)]:hidden rounded-xl border border-line bg-panel2"
          >
            <h2 className="m-0 flex items-center gap-2 px-3 py-1.5 text-[12px] font-normal text-muted">
              ⚑ Next promise
            </h2>
            <Link
              to={`/projects/${nextPromise.project.code}`}
              onClick={onNavigate}
              className="mx-1 mb-1 block rounded-lg border border-line bg-panel px-3 py-2 hover:bg-panel2"
            >
              <div className="truncate text-[14px] font-medium text-ink">
                {nextPromise.project.name}
              </div>
              <div className="font-mono text-xs text-muted">
                {fullDay(nextPromise.forecast.promised!)} ·{' '}
                {fromNow(nextPromise.forecast.promised!, asOf)}
              </div>
              {nextPromise.project.startDate && (
                <PromiseBlocks
                  start={nextPromise.project.startDate}
                  end={nextPromise.forecast.promised!}
                  today={asOf}
                />
              )}
            </Link>
          </section>
        )}
      </div>
      <div className="mt-2 flex shrink-0 items-center gap-2.5 border-t border-line px-2 pt-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal text-xs font-bold text-white"
          aria-hidden="true"
        >
          {name
            .split(/\s+/)
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </span>
        <Link
          to="/account/password"
          onClick={onNavigate}
          className="min-w-0 flex-1 leading-tight"
          title="Change password"
        >
          <span className="block truncate text-[14px] font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-muted">{role && ROLE_LABEL[role]}</span>
        </Link>
        <button
          type="button"
          className={`${buttonClass()} px-2.5 py-1 text-xs`}
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Time from the project's start to its promise, one block per slice; filled up to today. */
function PromiseBlocks({ start, end, today }: { start: string; end: string; today: string }) {
  const s = toDate(start).getTime();
  const e = toDate(end).getTime();
  const share = e > s ? Math.min(1, Math.max(0, (toDate(today).getTime() - s) / (e - s))) : 1;
  const n = 14;
  const filled = Math.round(share * n);
  return (
    <>
      <div
        className="mt-2 flex gap-[3px]"
        aria-label={`${Math.round(share * 100)}% of the time to the promise has passed`}
      >
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 flex-1 rounded-[2px] ${i < filled ? 'bg-teal' : 'bg-line'}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>start</span>
        <span>promise</span>
      </div>
    </>
  );
}
