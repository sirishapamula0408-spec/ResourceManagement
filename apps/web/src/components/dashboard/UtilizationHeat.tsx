import type { DashboardOverview } from '../../lib/api';
import { Panel, Swatch } from './Panel';
import {
  fmt,
  HEAT_CLASS,
  HEAT_LEGEND,
  heatLevel,
  identityColor,
  initials,
  isoWeek,
  shortDate,
} from '../../lib/theme';

type Heatmap = DashboardOverview['heatmap'];
type Cell = Heatmap['total']['cells'][number];

const avg = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** Weeks fully on leave have no percentage, so they are left out of the average. */
const avgPct = (cells: Cell[]) =>
  avg(cells.filter((c) => c.capacityHours > 0 || c.hours > 0).map((c) => c.pct));

const tip = (who: string, c: Cell) =>
  `${who} · ${shortDate(c.weekStart)}: ${fmt(c.hours, 1)} of ${fmt(c.capacityHours, 1)} h` +
  (c.leaveDays ? ` · ${c.leaveDays} day${c.leaveDays === 1 ? '' : 's'} of leave` : '');

function HeatCell({ pct, title, cell }: { pct: number; title?: string; cell?: Cell }) {
  if (cell && cell.capacityHours === 0 && cell.leaveDays > 0) {
    // On leave all week: planned work is over-allocation; otherwise just "Leave".
    return (
      <td
        className={`rounded-[3px] px-1.5 py-[7px] text-center font-semibold whitespace-nowrap ${cell.hours > 0 ? HEAT_CLASS[4] : 'bg-panel2 text-muted italic'}`}
        title={title}
      >
        Leave
      </td>
    );
  }
  return (
    <td
      className={`rounded-[3px] px-1.5 py-[7px] text-center font-semibold whitespace-nowrap ${HEAT_CLASS[heatLevel(pct)]}`}
      title={title}
    >
      {fmt(pct, 1)}
      {cell && cell.leaveDays > 0 && (
        <sup
          className="ml-0.5 font-normal text-muted"
          aria-label={`${cell.leaveDays} days of leave`}
        >
          L
        </sup>
      )}
    </td>
  );
}

export function UtilizationHeat({
  heatmap,
  weeks,
  currentWeek,
}: {
  heatmap: Heatmap;
  weeks: string[];
  currentWeek: string;
}) {
  const names = heatmap.rows.map((r) => r.name);

  return (
    <Panel
      title="Utilization by person"
      note={
        <>
          allocated hours ÷ weekly capacity after leave (L) ·{' '}
          {HEAT_LEGEND.map(({ level, label }) => (
            <span key={level} className="mr-1.5">
              <Swatch className={HEAT_CLASS[level]} />
              {label}
            </span>
          ))}
        </>
      }
      bodyClassName="overflow-x-auto"
    >
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr className="text-muted">
            <th className="min-w-[190px] p-1 text-left font-medium">Person</th>
            <th className="p-1 font-medium whitespace-nowrap">Avg %</th>
            {weeks.map((w) => (
              <th
                key={w}
                className={`p-1 text-center font-medium whitespace-nowrap ${w === currentWeek ? 'shadow-[inset_0_-2px_0_var(--color-teal)]' : ''}`}
              >
                W{isoWeek(w)}
                <br />
                {shortDate(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-t border-line py-[7px] text-left">
              <b>Team total</b>
            </td>
            <HeatCell pct={avgPct(heatmap.total.cells)} />
            {heatmap.total.cells.map((c) => (
              <HeatCell key={c.weekStart} pct={c.pct} cell={c} title={tip('Team', c)} />
            ))}
          </tr>
          {heatmap.rows.map((r) => (
            <tr key={r.personId}>
              <td className="py-1 text-left">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: identityColor(r.name, names) }}
                    aria-hidden="true"
                  >
                    {initials(r.name)}
                  </span>
                  <span>
                    {r.name}
                    <small className="block text-[11px] text-muted">
                      {[r.title, r.department].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                </div>
              </td>
              <HeatCell pct={avgPct(r.cells)} />
              {r.cells.map((c) => (
                <HeatCell key={c.weekStart} pct={c.pct} cell={c} title={tip(r.name, c)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
