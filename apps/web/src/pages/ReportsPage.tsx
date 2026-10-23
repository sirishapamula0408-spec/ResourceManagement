import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/tasks/taskUi';
import {
  api,
  isTeamMember,
  type Project,
  type ProjectReport,
  type Rag,
  type ReportTask,
  type StatusReport,
} from '../lib/api';
import { buttonClass } from '../lib/forms';
import { downloadText, reportFileName, reportToCsv } from '../lib/reportCsv';
import { downloadReportPptx } from '../lib/reportPptx';
import { fmt } from '../lib/theme';

type PeriodType = 'week' | 'month';

const RAG: Record<Rag, { label: string; className: string }> = {
  green: { label: 'On track', className: 'bg-green-soft text-green' },
  amber: { label: 'At risk', className: 'bg-amber-soft text-amber' },
  red: { label: 'Off track', className: 'bg-red-soft text-red' },
};

const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : '—';

function HealthPill({ rag }: { rag: Rag }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${RAG[rag].className}`}
    >
      <i className="inline-block h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {RAG[rag].label}
    </span>
  );
}

const panel =
  'min-w-0 rounded-lg border border-line bg-panel shadow-[0_1px_0_rgba(23,35,59,0.06)] print:shadow-none';
const th = 'border-b border-line px-2.5 py-2 text-left font-semibold whitespace-nowrap text-muted';
const td = 'border-b border-line px-2.5 py-[7px] align-top';

function TaskList({
  title,
  tasks,
  date,
  empty,
}: {
  title: string;
  tasks: ReportTask[];
  date: 'due' | 'completed';
  empty: string;
}) {
  return (
    <div className="min-w-0 break-inside-avoid">
      <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        {title} <span className="font-normal">· {tasks.length}</span>
      </h4>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-[12.5px]">
            <tbody>
              {tasks.map((t) => (
                <tr key={t.key} className="[&:last-child>td]:border-b-0">
                  <td className={`${td} w-16 font-semibold whitespace-nowrap text-muted`}>
                    {t.key}
                  </td>
                  <td className={td}>
                    {t.title}
                    <div className="text-[11.5px] text-muted">{t.assignee ?? 'Unassigned'}</div>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <StatusPill status={t.status} />
                  </td>
                  <td className={`${td} text-right whitespace-nowrap text-muted tabular-nums`}>
                    {date === 'due' ? shortDate(t.dueDate) : shortDate(t.completedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="bg-panel px-3.5 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-bold tracking-tight tabular-nums">{value}</div>
      {note && <div className="text-[11.5px] text-muted">{note}</div>}
    </div>
  );
}

function ProjectSection({
  report,
  periodWord,
  nextLabel,
  first,
}: {
  report: ProjectReport;
  periodWord: string;
  nextLabel: string;
  first: boolean;
}) {
  const { project: p, health, metrics: m } = report;
  const budget = m.estimateToDate ? Math.min(100, (m.loggedToDate / m.estimateToDate) * 100) : 0;
  return (
    <section
      aria-label={`${p.code} status`}
      className={`${panel} ${first ? '' : 'print:break-before-page'}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="m-0 text-base font-semibold">
            {p.code} · {p.name}
          </h3>
          <p className="m-0 text-xs text-muted">
            {[p.client, p.billable ? 'Billable' : 'Non-billable', p.owner && `Owner: ${p.owner}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="grid justify-items-end gap-1">
          <HealthPill rag={health.rag} />
          <ul className="m-0 list-none p-0 text-right text-xs text-muted">
            {health.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        <Metric label={`Completed this ${periodWord}`} value={m.completed} />
        <Metric
          label="Hours logged"
          value={`${fmt(m.loggedHours, 1)}h`}
          note={`of ${fmt(m.plannedHours, 1)}h planned`}
        />
        <Metric label="Open tasks" value={m.open} note={`${m.inProgress} in progress`} />
        <Metric label="Overdue" value={m.overdue} />
        <Metric label="Blocked" value={m.blocked} />
        <div className="bg-panel px-3.5 py-2.5">
          <div className="text-xs text-muted">Hours to date vs estimate</div>
          <div className="text-lg font-bold tracking-tight tabular-nums">
            {fmt(m.loggedToDate)}h{' '}
            <small className="text-xs font-medium text-muted">/ {fmt(m.estimateToDate)}h</small>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-panel2" aria-hidden="true">
            <i
              className={`block h-full ${budget >= 100 ? 'bg-red' : budget >= 90 ? 'bg-amber' : 'bg-teal'}`}
              style={{ width: `${budget}%` }}
            />
          </div>
        </div>
      </div>

      <div className="gap-6 px-4 py-3 lg:columns-2 [&>*]:mb-4">
        <TaskList
          title={`Completed this ${periodWord}`}
          tasks={report.completed}
          date="completed"
          empty={`Nothing completed this ${periodWord}.`}
        />
        <TaskList title="Blocked" tasks={report.blocked} date="due" empty="Nothing blocked." />
        <TaskList title="Overdue" tasks={report.overdue} date="due" empty="Nothing overdue." />
        <TaskList
          title="In progress"
          tasks={report.inProgress}
          date="due"
          empty="Nothing in progress."
        />
        <TaskList
          title={`Due next ${periodWord} (${nextLabel})`}
          tasks={report.dueNext}
          date="due"
          empty={`Nothing due next ${periodWord}.`}
        />
        <div className="min-w-0 break-inside-avoid">
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            Team effort this {periodWord}
          </h4>
          {report.team.length === 0 ? (
            <p className="text-xs text-muted">No time logged or planned this {periodWord}.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>
                    <th className={th}>Person</th>
                    <th className={`${th} text-right`}>Logged</th>
                    <th className={`${th} text-right`}>Planned</th>
                  </tr>
                </thead>
                <tbody>
                  {report.team.map((t) => (
                    <tr key={t.name} className="[&:last-child>td]:border-b-0">
                      <td className={td}>{t.name}</td>
                      <td className={`${td} text-right tabular-nums`}>{fmt(t.loggedHours, 1)}h</td>
                      <td className={`${td} text-right text-muted tabular-nums`}>
                        {fmt(t.plannedHours, 1)}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const segment =
  'px-3 py-1.5 font-medium hover:bg-panel2 aria-pressed:bg-ink aria-pressed:text-panel aria-pressed:hover:bg-ink';

/** Weekly and monthly project status reports, generated from live data. */
export function ReportsPage() {
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [date, setDate] = useState<string>(); // any day in the period; undefined = today
  const [projectId, setProjectId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const {
    data: report,
    isLoading,
    error,
    isPlaceholderData,
  } = useQuery({
    queryKey: ['reports', periodType, date, projectId],
    queryFn: () => {
      const params = new URLSearchParams({ period: periodType });
      if (date) params.set('date', date);
      if (projectId) params.set('projectId', projectId);
      return api<StatusReport>(`/reports/status?${params}`);
    },
    placeholderData: keepPreviousData,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });

  const periodWord = periodType === 'week' ? 'week' : 'month';
  const control = 'rounded-md border border-line bg-panel px-2.5 py-1.5';

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          subtitle={isTeamMember() ? 'Status of the projects you are on' : undefined}
        >
          <div
            className="flex overflow-hidden rounded-md border border-line bg-panel"
            role="group"
            aria-label="Report period"
          >
            {(['week', 'month'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`${segment} ${t === 'month' ? 'border-l border-line' : ''}`}
                aria-pressed={periodType === t}
                onClick={() => {
                  setPeriodType(t);
                  setDate(undefined);
                }}
              >
                {t === 'week' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md border border-line bg-panel">
            <button
              type="button"
              className={segment}
              disabled={!report}
              onClick={() => report && setDate(report.period.previous)}
            >
              ← Previous
            </button>
            <button
              type="button"
              className={`${segment} border-x border-line disabled:text-muted disabled:opacity-60`}
              disabled={date === undefined}
              onClick={() => setDate(undefined)}
            >
              {periodType === 'week' ? 'This week' : 'This month'}
            </button>
            <button
              type="button"
              className={segment}
              disabled={!report}
              onClick={() => report && setDate(report.period.next)}
            >
              Next →
            </button>
          </div>
          <select
            className={control}
            aria-label="Project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <button
            type="button"
            className={buttonClass()}
            disabled={!report?.projects.length}
            onClick={() => report && downloadText(reportFileName(report), reportToCsv(report))}
          >
            Download CSV
          </button>
          <button
            type="button"
            className={buttonClass()}
            disabled={!report?.projects.length || exporting}
            onClick={async () => {
              if (!report) return;
              setExporting(true);
              setExportError(null);
              try {
                await downloadReportPptx(report, reportFileName(report, 'pptx'));
              } catch {
                setExportError('The PowerPoint file couldn’t be created. Try again.');
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? 'Preparing…' : 'Download PowerPoint'}
          </button>
          <button
            type="button"
            className={buttonClass('primary')}
            disabled={!report?.projects.length}
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </PageHeader>
      </div>

      {exportError && (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-red print:hidden">
          {exportError}
        </p>
      )}
      {isLoading && <p className="p-2.5 text-center text-xs text-muted">Generating report…</p>}
      {error && <p className="text-red">The report couldn’t be generated: {error.message}</p>}

      {report && (
        <div className={`grid gap-4 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
          <header className="grid gap-0.5">
            <div className="text-xs font-semibold tracking-wide text-teal uppercase">
              {periodType === 'week' ? 'Weekly' : 'Monthly'} project status report
            </div>
            <h2 className="m-0 text-xl font-bold tracking-tight">{report.period.label}</h2>
            <p className="m-0 text-xs text-muted">
              Status as of {shortDate(report.period.asOf)} · generated{' '}
              {new Date(report.generatedAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </header>

          {report.projects.length === 0 && (
            <div className={`${panel} p-6 text-center text-muted`}>
              No projects to report on for this selection.
            </div>
          )}

          {report.projects.length > 1 && (
            <section aria-label="Portfolio summary" className={`${panel} break-inside-avoid`}>
              <h3 className="m-0 flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm font-semibold">
                Portfolio summary
                <span className="text-xs font-normal text-muted">
                  {report.totals.red} off track · {report.totals.amber} at risk ·{' '}
                  {report.totals.green} on track
                </span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {[
                        'Project',
                        'Health',
                        'Completed',
                        'In progress',
                        'Overdue',
                        'Blocked',
                        'Logged / planned',
                        'Hours to date / estimate',
                      ].map((h) => (
                        <th key={h} className={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.projects.map(({ project: p, health, metrics: m }) => (
                      <tr key={p.id}>
                        <td className={td}>
                          <b>{p.code}</b> <span className="text-muted">{p.name}</span>
                        </td>
                        <td className={td}>
                          <HealthPill rag={health.rag} />
                        </td>
                        <td className={`${td} tabular-nums`}>{m.completed}</td>
                        <td className={`${td} tabular-nums`}>{m.inProgress}</td>
                        <td
                          className={`${td} tabular-nums ${m.overdue ? 'font-semibold text-red' : ''}`}
                        >
                          {m.overdue}
                        </td>
                        <td
                          className={`${td} tabular-nums ${m.blocked ? 'font-semibold text-red' : ''}`}
                        >
                          {m.blocked}
                        </td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>
                          {fmt(m.loggedHours, 1)} / {fmt(m.plannedHours, 1)}h
                        </td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>
                          {fmt(m.loggedToDate)} / {fmt(m.estimateToDate)}h
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold [&>td]:border-b-0">
                      <td className={td}>All projects</td>
                      <td className={td} />
                      <td className={`${td} tabular-nums`}>{report.totals.completed}</td>
                      <td className={td} />
                      <td className={`${td} tabular-nums`}>{report.totals.overdue}</td>
                      <td className={`${td} tabular-nums`}>{report.totals.blocked}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>
                        {fmt(report.totals.loggedHours, 1)} / {fmt(report.totals.plannedHours, 1)}h
                      </td>
                      <td className={td} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report.projects.map((r, i) => (
            <ProjectSection
              key={r.project.id}
              report={r}
              periodWord={periodWord}
              nextLabel={report.period.nextLabel}
              first={i === 0 && report.projects.length === 1}
            />
          ))}

          {report.projects.length > 0 && (
            <p className="m-0 text-xs text-muted">
              <b>How health is worked out:</b> Off track if a critical task is blocked, 3 or more
              tasks are overdue, or hours logged exceed the total estimate. At risk if any task is
              blocked or overdue, or hours logged reach 90% of the estimate. Otherwise on track.
              Planned hours spread each task’s estimate evenly over its working days, as on the
              dashboard. Blocked and in-progress lists show each task’s current status.
            </p>
          )}
        </div>
      )}
    </>
  );
}
