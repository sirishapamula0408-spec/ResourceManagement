import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HealthPill } from '../components/HealthPill';
import { Avatar } from '../components/tasks/taskUi';
import { api, type Portfolio, type PortfolioProject, type Team } from '../lib/api';
import { PROJECT_STATUS_CLASS, PROJECT_STATUS_LABEL } from '../lib/statusStyles';
import { fmt, identityColor } from '../lib/theme';

/**
 * Portfolio (phase 1), laid out like the prototype (Prototype/screens/Portfolio.png): a one-line
 * summary, cards for the projects closest to (or past) their promised date, every project on a
 * timeline from today with its promise marked, and a side panel of what finishes next and what
 * can't be forecast yet. The forecast is the latest due date of the open tasks against the
 * project's end date; capacity-based forecasting comes in phase 2.
 */

type Row = PortfolioProject;

const DAY = 86_400_000;
const panel = 'min-w-0 rounded-xl border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)]';
const control =
  'rounded-lg border border-line bg-panel px-3 py-1.5 text-[13px] font-medium hover:bg-panel2';
const promiseStripes =
  'bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_1.5px,transparent_1.5px_5px)]';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const thisYear = new Date().getUTCFullYear();
/** "Wed 16 Dec", with the year when it isn't this year. */
const day = (iso: string | null, weekday = true) => {
  if (!iso) return '—';
  const d = toDate(iso);
  return d
    .toLocaleDateString('en-GB', {
      weekday: weekday ? 'short' : undefined,
      day: 'numeric',
      month: 'short',
      year: d.getUTCFullYear() === thisYear ? undefined : 'numeric',
      timeZone: 'UTC',
    })
    .replace(',', '');
};
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Working days (Mon-Fri) after `from` up to and including `to`; 0 if `to` isn't later. */
function workDaysAfter(from: string, to: string) {
  let n = 0;
  for (let t = toDate(from).getTime() + DAY; t <= toDate(to).getTime(); t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/** Late first (most days late), then on time (least spare), then the rest. */
function rank(r: Row): [number, number] {
  const order = { late: 0, on_time: 1, no_plan: 2, no_promise: 3, done: 4 }[r.forecast.state];
  return [order, -(r.forecast.daysLate ?? 0)];
}
const byRank = (a: Row, b: Row) => {
  const [a1, a2] = rank(a);
  const [b1, b2] = rank(b);
  return a1 - b1 || a2 - b2 || a.project.code.localeCompare(b.project.code);
};

/** A small square with the project's key initials, coloured per project. */
function ProjectIcon({ code, codes }: { code: string; codes: string[] }) {
  return (
    <span
      className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-panel text-[11px] font-bold"
      style={{ color: identityColor(code, codes) }}
      aria-hidden="true"
    >
      {code.slice(0, 2)}
    </span>
  );
}

/** "+3 work days late" / "4 work days spare" / why there is no forecast. */
function lateness(f: Row['forecast']) {
  const days = (n: number) => `work ${n === 1 ? 'day' : 'days'}`;
  if (f.state === 'late')
    return { big: `+${f.daysLate}`, unit: `${days(f.daysLate!)} late`, tone: 'text-red' };
  if (f.state === 'on_time') {
    const spare = -(f.daysLate ?? 0);
    return spare
      ? { big: String(spare), unit: `${days(spare)} spare`, tone: 'text-green' }
      : { big: '0', unit: 'days spare', tone: 'text-amber' };
  }
  if (f.state === 'done') return { big: '✓', unit: 'all tasks done', tone: 'text-green' };
  if (f.state === 'no_promise') return { big: '?', unit: 'no end date set', tone: 'text-muted' };
  return { big: '?', unit: 'no due dates yet', tone: 'text-muted' };
}

/**
 * One block per working day from today: blue for planned work up to the promise, red for work
 * past it, grey for spare days before it. The dark line marks the promise.
 */
function DayBlocks({ work, promise }: { work: number; promise: number }) {
  const total = Math.max(work, promise, 1);
  const per = Math.ceil(total / 22); // about 22 blocks at most
  const n = Math.ceil(total / per);
  const w = Math.ceil(work / per);
  const p = Math.ceil(promise / per);
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="relative h-4 flex-1">
            <span
              className={`absolute inset-0 rounded-[2px] ${
                i < Math.min(w, p) ? 'bg-teal' : i < w ? 'bg-red/70' : 'bg-line'
              }`}
            />
            {i === p - 1 && p < n && (
              <span className="absolute -top-1 -right-[2.5px] -bottom-1 w-0.5 rounded bg-ink" />
            )}
          </span>
        ))}
      </div>
      <span
        className="font-mono text-xs whitespace-nowrap text-muted tabular-nums"
        title="Working days of planned work / working days to the promise"
      >
        {work} / {promise}d
      </span>
    </div>
  );
}

function AttentionCard({ r, codes, asOf }: { r: Row; codes: string[]; asOf: string }) {
  const { project: p, forecast: f, health } = r;
  const l = lateness(f);
  const note =
    health.rag !== 'green'
      ? `${health.reasons.join(' · ')}.`
      : f.unscheduled
        ? `${plural(f.unscheduled, 'open task')} without a due date, so it may run later.`
        : `${plural(r.progress.open, 'open task')}, ${fmt(r.progress.remainingHours)}h of work left.`;
  return (
    <article
      className={`${panel} flex flex-col overflow-hidden bg-panel2`}
      aria-label={`${p.name} forecast`}
    >
      <header className="flex items-center gap-2.5 px-4 py-2.5">
        <ProjectIcon code={p.code} codes={codes} />
        <span className="min-w-0 flex-1 truncate text-[15px]">{p.name}</span>
        <HealthPill rag={health.rag} title={health.reasons.join('\n')} />
      </header>
      <div className="mx-1.5 mb-1.5 flex flex-1 flex-col gap-3 rounded-lg border border-line bg-panel px-4 py-3.5">
        <div>
          <span className={`text-3xl font-semibold tabular-nums ${l.tone}`}>{l.big}</span>{' '}
          <span className="text-lg">{l.unit}</span>
          <div className="mt-1 text-[13px] text-muted">
            Ships <b className="font-mono font-semibold text-ink">{day(f.finish)}</b> · promised{' '}
            {day(f.promised)}
          </div>
        </div>
        {f.finish && f.promised && (
          <DayBlocks
            work={workDaysAfter(asOf, f.finish)}
            promise={workDaysAfter(asOf, f.promised)}
          />
        )}
        <p className="m-0 flex-1 text-[13px] leading-snug">{note}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-muted">
            {p.lead ? `Lead: ${p.lead.name}` : 'No lead'}
          </span>
          <Link
            to={`/projects/${p.code}`}
            className="rounded-lg bg-ink px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-panel hover:opacity-90"
          >
            Open project ›
          </Link>
        </div>
      </div>
    </article>
  );
}

const RANGES: [number, string][] = [
  [6, 'Next 6 weeks'],
  [13, 'Next 3 months'],
  [26, 'Next 6 months'],
  [52, 'Next 12 months'],
];

/** Timeline ticks: Mondays for short windows, month starts for long ones. */
function ticks(start: number, end: number, weeks: number) {
  const out: { at: number; label: string }[] = [];
  const label = (t: number) =>
    new Date(t).toLocaleDateString('en-GB', {
      day: weeks > 13 ? undefined : 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  if (weeks <= 13) {
    let t = start + DAY;
    while (new Date(t).getUTCDay() !== 1) t += DAY;
    const step = weeks <= 6 ? 7 : 14;
    // Leave room for "Today" at the left edge.
    for (; t < end - 3 * DAY; t += step * DAY)
      if (t - start > (end - start) * 0.07) out.push({ at: t, label: label(t) });
  } else {
    const d = new Date(start);
    for (let m = 1; ; m++) {
      const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 1);
      if (t >= end - 5 * DAY) break;
      if (t - start > (end - start) * 0.07) out.push({ at: t, label: label(t) });
    }
  }
  return out;
}

function TimelineBar({ r, start, end }: { r: Row; start: number; end: number }) {
  const f = r.forecast;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - start) / (end - start)) * 100));
  const finish = f.finish ? toDate(f.finish).getTime() + DAY : null; // end of the finish day
  const promised = f.promised ? toDate(f.promised).getTime() + DAY : null;
  return (
    <div className="relative h-7">
      {promised !== null && promised > start && promised <= end && (
        <span
          className={`absolute top-0 bottom-0 w-2.5 -translate-x-1/2 opacity-60 ${promiseStripes}`}
          style={{ left: `${pct(promised)}%` }}
          title={`Promised ${day(f.promised)}`}
        />
      )}
      {f.state === 'done' ? (
        <span className="absolute top-1/2 left-0 -translate-y-1/2 text-xs text-green">
          All tasks done
        </span>
      ) : finish === null ? (
        <span className="absolute top-1/2 left-0 -translate-y-1/2 text-xs text-muted">
          {f.state === 'no_plan' ? 'No due dates yet' : 'No end date set'}
        </span>
      ) : (
        <>
          {/* Planned work up to the promise (or all of it when on time). */}
          <span
            className="absolute top-1/2 left-0 h-2.5 -translate-y-1/2 rounded-full bg-teal"
            style={{
              width: `${Math.max(pct(promised !== null && promised < finish ? promised : finish), 0.8)}%`,
            }}
            title={`Planned finish ${day(f.finish)}`}
          />
          {promised !== null && promised < finish && (
            <span
              className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-red/70 ${finish > end ? 'rounded-r-none' : ''}`}
              style={{
                left: `calc(${pct(promised)}% + 3px)`,
                width: `calc(${pct(finish) - pct(promised)}% - 3px)`,
              }}
              title={`${f.daysLate} work days past the promise`}
            />
          )}
        </>
      )}
    </div>
  );
}

function ForecastText({ f }: { f: Row['forecast'] }) {
  if (f.state === 'late' || f.state === 'on_time')
    return (
      <>
        <div className={`font-mono text-[13px] ${f.state === 'late' ? 'text-red' : ''}`}>
          {day(f.finish, false)}
        </div>
        <div className="text-xs text-muted">
          {f.state === 'late'
            ? `+${f.daysLate}d late`
            : f.daysLate
              ? `${-f.daysLate}d spare`
              : 'on the day'}
        </div>
      </>
    );
  if (f.state === 'done')
    return <div className="text-xs text-green">Done {day(f.finish, false)}</div>;
  return <div className="text-xs text-muted">—</div>;
}

function SidePanel({
  title,
  aside,
  children,
}: {
  title: string;
  aside: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`${panel} overflow-hidden bg-panel2`}>
      <h2 className="m-0 flex items-center justify-between px-4 py-2.5 text-[15px] font-normal">
        {title}
        <span className="font-mono text-xs text-muted">{aside}</span>
      </h2>
      <div className="mx-1.5 mb-1.5 rounded-lg border border-line bg-panel px-4 py-1.5">
        {children}
      </div>
    </section>
  );
}

export function PortfolioPage() {
  const navigate = useNavigate();
  const [teamId, setTeamId] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [weeks, setWeeks] = useState(13);

  const { data, isLoading, error } = useQuery({
    queryKey: ['portfolio', teamId, includeClosed],
    queryFn: () => {
      const params = new URLSearchParams();
      if (teamId) params.set('teamId', teamId);
      if (includeClosed) params.set('includeClosed', 'true');
      return api<Portfolio>(`/portfolio?${params}`);
    },
    placeholderData: keepPreviousData,
  });
  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => api<Team[]>('/teams'),
  });

  const rows = useMemo(() => [...(data?.projects ?? [])].sort(byRank), [data]);
  const codes = rows.map((r) => r.project.code);
  const leads = [...new Set(rows.flatMap((r) => (r.project.lead ? [r.project.lead.name] : [])))];
  const t = data?.totals;
  const asOf = data?.asOf ?? new Date().toISOString().slice(0, 10);
  const start = toDate(asOf).getTime();
  const end = start + weeks * 7 * DAY;
  const planned = (r: Row) => r.forecast.state === 'late' || r.forecast.state === 'on_time';
  const cards = rows.filter(planned).slice(0, 4);
  const finishingNext = rows
    .filter(planned)
    .sort((a, b) => a.forecast.finish!.localeCompare(b.forecast.finish!))
    .slice(0, 5);
  const unforecast = rows.filter(
    (r) => r.forecast.state === 'no_plan' || r.forecast.state === 'no_promise',
  );
  const nextPromise = rows
    .filter(
      (r) => r.forecast.promised && r.forecast.promised >= asOf && r.forecast.state !== 'done',
    )
    .sort((a, b) => a.forecast.promised!.localeCompare(b.forecast.promised!))[0];
  const atRisk = t ? t.red + t.amber : 0;

  return (
    <>
      <header className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-3xl font-semibold tracking-tight">Portfolio</h1>
        {t && (
          <span className="rounded-md border border-line px-2 py-0.5 text-[13px] text-muted tabular-nums">
            {plural(t.projects, 'project')}
          </span>
        )}
      </header>
      {t && (
        <p className="mt-0 mb-4 text-[15px] text-muted">
          {t.projects === 0 ? (
            'No projects for this selection.'
          ) : (
            <>
              {atRisk === 0 ? (
                <>
                  Every project is <span className="text-green">on track</span>.{' '}
                </>
              ) : (
                <>
                  <span className="text-amber">
                    {atRisk} of {t.projects} {atRisk === 1 ? 'is' : 'are'} at risk or off track
                  </span>
                  .{' '}
                </>
              )}
              On today’s plans{' '}
              {t.late ? (
                <span className="text-red">
                  {plural(t.late, 'project')} {t.late === 1 ? 'misses its' : 'miss their'} promised
                  date
                </span>
              ) : (
                <span className="text-green">no project misses its promised date</span>
              )}
              {t.noPromise + t.noPlan > 0 && (
                <>
                  , <span className="text-ink">{t.noPromise + t.noPlan}</span> can’t be forecast yet
                </>
              )}
              .
            </>
          )}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div
          className="flex rounded-lg border border-line bg-panel2 p-0.5"
          role="tablist"
          aria-label="Portfolio views"
        >
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="rounded-md bg-panel px-3 py-1 text-[13px] font-medium shadow-sm"
          >
            Overview
          </button>
          {['Roadmap', 'People'].map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected="false"
              disabled
              title="Coming in a later phase"
              className="px-3 py-1 text-[13px] text-muted"
            >
              {v}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <select
          className={control}
          aria-label="Timeline range"
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value))}
        >
          {RANGES.map(([w, label]) => (
            <option key={w} value={w}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={control}
          aria-label="Team"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="">All teams</option>
          {[...teams]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
        </select>
        <label className={`${control} flex items-center gap-1.5`}>
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => setIncludeClosed(e.target.checked)}
          />
          Include completed
        </label>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-red">
          {(error as Error).message}
        </p>
      )}
      {isLoading && <p className="text-muted">Loading…</p>}

      {t && (
        <>
          {cards.length > 0 && (
            <section
              aria-label="Closest to their promise"
              className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              {cards.map((r) => (
                <AttentionCard key={r.project.id} r={r} codes={codes} asOf={asOf} />
              ))}
            </section>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-label="All projects" className={panel}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
                <div>
                  <h2 className="m-0 flex items-center gap-2 text-lg font-semibold">
                    All projects
                    <span className="rounded-md border border-line px-1.5 text-xs font-normal text-muted">
                      {t.projects}
                    </span>
                  </h2>
                  <p className="m-0 text-[13px] text-muted">
                    The striped mark is each promise. Work past it is late.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-[13px]">
                  <span className="flex items-center gap-1.5">
                    <i className="h-2.5 w-4 rounded-sm bg-teal" /> Planned work
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className={`h-3 w-2.5 opacity-60 ${promiseStripes}`} /> Promise
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-2.5 w-4 rounded-sm bg-red/70" /> Past the promise
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-panel2 text-left text-muted">
                      <th className="w-[250px] px-5 py-2.5 font-normal">Project</th>
                      <th className="w-[110px] px-2 py-2.5 font-normal">Health</th>
                      <th className="px-2 py-2.5 font-normal">
                        <div className="relative h-4">
                          <span className="absolute left-0 font-medium text-ink">Today</span>
                          {ticks(start, end, weeks).map((k) => (
                            <span
                              key={k.at}
                              className="absolute -translate-x-1/2 font-mono text-xs whitespace-nowrap"
                              style={{ left: `${((k.at - start) / (end - start)) * 100}%` }}
                            >
                              {k.label}
                            </span>
                          ))}
                        </div>
                      </th>
                      <th className="w-[100px] px-5 py-2.5 text-right font-normal">Forecast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const { project: p, forecast: f } = r;
                      return (
                        <tr
                          key={p.id}
                          className="cursor-pointer border-b border-line last:border-b-0 hover:bg-panel2"
                          onClick={() => navigate(`/projects/${p.code}`)}
                        >
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-3">
                              <span
                                className={`h-9 w-[3px] shrink-0 rounded ${f.state === 'late' ? 'bg-red' : 'bg-transparent'}`}
                                aria-hidden="true"
                              />
                              <ProjectIcon code={p.code} codes={codes} />
                              <div className="min-w-0">
                                <div className="truncate text-[15px]">{p.name}</div>
                                <div className="truncate font-mono text-xs text-muted">
                                  {p.lead?.name.split(' ')[0] ?? 'No lead'} · {r.progress.done}/
                                  {r.progress.tasks}
                                  {p.status !== 'ACTIVE' && (
                                    <span
                                      className={`ml-1.5 rounded px-1 font-sans text-[10px] font-semibold text-ink ${PROJECT_STATUS_CLASS[p.status]}`}
                                    >
                                      {PROJECT_STATUS_LABEL[p.status]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-2.5">
                            <HealthPill rag={r.health.rag} title={r.health.reasons.join('\n')} />
                          </td>
                          <td className="px-2 py-2.5">
                            <TimelineBar r={r} start={start} end={end} />
                          </td>
                          <td className="px-5 py-2.5 text-right whitespace-nowrap">
                            <ForecastText f={f} />
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-center text-muted">
                          No projects for this selection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-panel2 px-5 py-2.5 text-[13px] text-muted">
                <span>
                  ⚠ {t.late} late · {plural(t.daysLate, 'work day')} in total
                </span>
                <span>◷ {plural(t.noPromise + t.noPlan, 'project')} can’t be forecast</span>
                <span className="flex-1" />
                {nextPromise && (
                  <span className="font-mono">
                    Next promise {day(nextPromise.forecast.promised)} · {nextPromise.project.name}
                  </span>
                )}
              </footer>
            </section>

            <aside className="flex flex-col gap-4">
              <SidePanel title="Finishing next" aside="planned finish">
                {finishingNext.length ? (
                  <ol className="m-0 list-none p-0">
                    {finishingNext.map((r, i) => (
                      <li
                        key={r.project.id}
                        className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line font-mono text-xs text-muted">
                          {i + 1}
                        </span>
                        <Link
                          to={`/projects/${r.project.code}`}
                          className="min-w-0 flex-1 hover:underline"
                        >
                          <div className="truncate">{r.project.name}</div>
                          <div
                            className={`font-mono text-xs ${r.forecast.state === 'late' ? 'text-red' : 'text-muted'}`}
                          >
                            {day(r.forecast.finish)}
                            {r.forecast.state === 'late' && ` · +${r.forecast.daysLate}d late`}
                          </div>
                        </Link>
                        {r.project.lead && (
                          <Avatar name={r.project.lead.name} allNames={leads} size={26} />
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="my-2 text-[13px] text-muted">Nothing planned to finish yet.</p>
                )}
              </SidePanel>

              {unforecast.length > 0 && (
                <SidePanel title="Can’t forecast yet" aside={plural(unforecast.length, 'project')}>
                  <ul className="m-0 list-none p-0">
                    {unforecast.map((r) => (
                      <li
                        key={r.project.id}
                        className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
                      >
                        <ProjectIcon code={r.project.code} codes={codes} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{r.project.name}</div>
                          <div className="text-xs text-amber">
                            {r.forecast.state === 'no_promise'
                              ? 'Set an end date on the project'
                              : r.progress.tasks
                                ? 'Give its open tasks due dates'
                                : 'No tasks yet'}
                          </div>
                        </div>
                        <Link
                          to={`/projects/${r.project.code}${r.forecast.state === 'no_promise' ? '/settings' : '/list'}`}
                          className="rounded-md border border-line px-2.5 py-1 text-xs font-medium whitespace-nowrap hover:bg-panel2"
                        >
                          Fix ›
                        </Link>
                      </li>
                    ))}
                  </ul>
                </SidePanel>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
