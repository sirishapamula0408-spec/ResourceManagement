import type { DashboardOverview } from '../../lib/api';
import { Panel, Swatch } from './Panel';
import { fmt, identityColor } from '../../lib/theme';

type Dept = DashboardOverview['departments'][number];

const R = 80;
const r = 48;
const C = 95;

function arcPath(a0: number, a1: number) {
  const p = (rad: number, ang: number) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(R, a0);
  const [x1, y1] = p(R, a1);
  const [x2, y2] = p(r, a1);
  const [x3, y3] = p(r, a0);
  return `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r} ${r} 0 ${large} 0 ${x3} ${y3}Z`;
}

export function DepartmentDonut({
  departments,
  allDepartments,
  weeks,
}: {
  departments: Dept[];
  /** Every department name, so colours stay put when a filter removes some. */
  allDepartments: string[];
  weeks: number;
}) {
  const total = departments.reduce((s, d) => s + d.hours, 0);
  const color = (d: Dept) => identityColor(d.department, allDepartments);
  const fte = total / 40 / Math.max(weeks, 1);

  // Each slice starts where the previous one ended, beginning at 12 o'clock.
  const slices = departments.reduce<{ d: Dept; a0: number; a1: number }[]>((acc, d) => {
    const a0 = acc.length ? acc[acc.length - 1].a1 : -Math.PI / 2;
    return [...acc, { d, a0, a1: a0 + (d.hours / (total || 1)) * 2 * Math.PI }];
  }, []);

  return (
    <Panel title="Demand by department" note={`scheduled hours, ${weeks} weeks`}>
      {total === 0 ? (
        <p className="p-2.5 text-center text-xs text-muted">No scheduled work in this window.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <svg
            width="190"
            height="190"
            viewBox="0 0 190 190"
            role="img"
            aria-label="Demand by department"
            className="shrink-0"
          >
            {slices.length === 1 ? (
              <circle
                cx={C}
                cy={C}
                r={(R + r) / 2}
                fill="none"
                stroke={color(slices[0].d)}
                strokeWidth={R - r}
              />
            ) : (
              slices.map(({ d, a0, a1 }) => (
                <path
                  key={d.department}
                  d={arcPath(a0, a1)}
                  fill={color(d)}
                  stroke="var(--color-panel)"
                  strokeWidth="1.5"
                >
                  <title>{`${d.department}: ${fmt(d.hours, 1)} h`}</title>
                </path>
              ))
            )}
            <text
              x={C}
              y={C - 2}
              textAnchor="middle"
              fontSize="20"
              fontWeight="700"
              fill="var(--color-ink)"
            >
              {fmt(fte, 1)}
            </text>
            <text x={C} y={C + 15} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
              avg FTE / week
            </text>
          </svg>
          <ul className="min-w-[180px] flex-1 text-[13px]">
            {departments.map((d) => (
              <li
                key={d.department}
                className="flex justify-between gap-2 border-b border-dashed border-line py-1"
                title={`${fmt(d.hours, 1)} h · ${fmt(d.avgFtePerWeek, 1)} FTE per week`}
              >
                <span>
                  <Swatch color={color(d)} />
                  {d.department}
                </span>
                <b>{fmt((d.hours / total) * 100, 1)}%</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
