import type { DashboardOverview } from '../../lib/api';
import { Panel, Swatch } from './Panel';
import { fmt, shortDate } from '../../lib/theme';

type Week = DashboardOverview['demandVsAvailability'][number];

const W = 640;
const H = 300;
const PAD_LEFT = 36;
const PAD_BOTTOM = 44;
const PAD_TOP = 14;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

/** Weekly stacked bars: demand (amber) under available capacity (teal), as % of team capacity. */
export function DemandBars({ weeks }: { weeks: Week[] }) {
  const colW = (W - PAD_LEFT - 10) / Math.max(weeks.length, 1);
  const barW = colW * 0.62;

  return (
    <Panel title="Demand vs availability" note="% of team capacity per week">
      <div className="flex flex-wrap gap-3.5 text-xs text-muted">
        <span>
          <Swatch className="bg-amber" />
          Demand
        </span>
        <span>
          <Swatch className="bg-teal" />
          Available
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Weekly demand versus availability as a percentage of team capacity"
      >
        {[0, 25, 50, 75, 100].map((g) => {
          const y = PAD_TOP + PLOT_H - (PLOT_H * g) / 100;
          return (
            <g key={g}>
              <line x1={PAD_LEFT} x2={W - 6} y1={y} y2={y} stroke="var(--color-line)" />
              <text
                x={PAD_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--color-muted)"
              >
                {g}
              </text>
            </g>
          );
        })}
        {weeks.map((w, i) => {
          const demand = Math.min(100, w.demandPct);
          const available = 100 - demand;
          const x = PAD_LEFT + i * colW + (colW - barW) / 2;
          const hd = (PLOT_H * demand) / 100;
          const ha = (PLOT_H * available) / 100;
          const yd = PAD_TOP + PLOT_H - hd;
          const cx = x + barW / 2;
          return (
            <g key={w.weekStart}>
              <title>
                {`Week of ${shortDate(w.weekStart)}: demand ${fmt(w.demandPct, 1)}% (${fmt(w.demandHours, 1)} of ${fmt(w.capacityHours, 0)} h)` +
                  (w.unassignedHours ? `, ${fmt(w.unassignedHours, 1)} h unassigned` : '')}
              </title>
              <rect x={x} y={PAD_TOP} width={barW} height={ha} fill="var(--color-teal)" rx="2" />
              <rect x={x} y={yd} width={barW} height={hd} fill="var(--color-amber)" rx="2" />
              {ha > 16 && (
                <text
                  x={cx}
                  y={PAD_TOP + ha / 2 + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#fff"
                >
                  {available.toFixed(1)}
                </text>
              )}
              {hd > 16 && (
                <text
                  x={cx}
                  y={yd + hd / 2 + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#17233B"
                >
                  {demand.toFixed(1)}
                </text>
              )}
              <text
                x={cx}
                y={H - PAD_BOTTOM + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-muted)"
                fontWeight={w.isCurrent ? 700 : undefined}
              >
                {shortDate(w.weekStart)}
              </text>
              {w.isCurrent && (
                <text
                  x={cx}
                  y={H - PAD_BOTTOM + 30}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="600"
                  fill="var(--color-teal)"
                >
                  this week
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}
