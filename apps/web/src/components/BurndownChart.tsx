import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { api, ApiError, type Burndown } from '../lib/api';
import { errorMessage } from '../lib/forms';
import { fmt, shortDate } from '../lib/theme';

type Unit = 'hours' | 'tasks';
interface Point {
  date: string;
  remaining: number | null;
  ideal: number;
}

const axisTick = { fontSize: 11, fill: 'var(--color-muted)' };
const unitLabel = (unit: Unit, n: number) =>
  unit === 'hours' ? `${fmt(n, n % 1 ? 1 : 0)} h` : `${fmt(n)} ${n === 1 ? 'task' : 'tasks'}`;

function ChartTooltip({ active, payload, unit }: TooltipContentProps & { unit: Unit }) {
  const point = payload?.[0]?.payload as Point | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs shadow-[0_4px_12px_rgba(9,30,66,0.15)]">
      <p className="mb-0.5 font-semibold">{shortDate(point.date)}</p>
      <p>
        Remaining:{' '}
        <b className="font-semibold">
          {point.remaining === null ? 'not yet' : unitLabel(unit, point.remaining)}
        </b>
      </p>
      <p className="text-muted">Ideal: {unitLabel(unit, point.ideal)}</p>
    </div>
  );
}

/** Swatches for the two lines (a solid and a dashed stroke). */
function Legend() {
  return (
    <span className="flex items-center gap-3 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <svg width="18" height="8" aria-hidden>
          <line x1="0" x2="18" y1="4" y2="4" stroke="var(--color-teal)" strokeWidth="2" />
        </svg>
        Remaining
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="18" height="8" aria-hidden>
          <line
            x1="0"
            x2="18"
            y1="4"
            y2="4"
            stroke="var(--color-muted)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        </svg>
        Ideal
      </span>
    </span>
  );
}

/**
 * A sprint's burndown (M4 JIRA-lite): work still open at the end of each day against the ideal
 * straight line to zero, in hours (estimates) or tasks. The compact version, for summary cards,
 * shows hours without axis titles or the unit switch.
 */
export function BurndownChart({
  sprintId,
  compact = false,
}: {
  sprintId: string;
  compact?: boolean;
}) {
  const [unit, setUnit] = useState<Unit>('hours');
  const { data, error, isLoading } = useQuery({
    queryKey: ['burndown', sprintId],
    queryFn: () => api<Burndown>(`/sprints/${sprintId}/burndown`),
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  });

  if (isLoading) return <p className="text-xs text-muted">Loading the burndown…</p>;
  if (error || !data) {
    return <p className="text-sm text-muted">{error ? errorMessage(error) : 'No burndown.'}</p>;
  }

  const points: Point[] = data.days.map((d) => ({
    date: d.date,
    remaining: unit === 'hours' ? d.remainingHours : d.remainingTasks,
    ideal: unit === 'hours' ? d.idealHours : d.idealTasks,
  }));
  const today = new Date().toISOString().slice(0, 10);
  const total = unit === 'hours' ? data.totalHours : data.totalTasks;
  const latest = [...points].reverse().find((p) => p.remaining !== null);
  const yTitle = unit === 'hours' ? 'Hours remaining' : 'Tasks remaining';
  const summary = latest
    ? `${unitLabel(unit, latest.remaining!)} of ${unitLabel(unit, total)} remaining on ${shortDate(latest.date)}`
    : `Starts ${shortDate(data.sprint.startDate)}`;

  return (
    <figure className="flex min-w-0 flex-col gap-2" aria-label={`Burndown of ${data.sprint.name}`}>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-sm">{summary}</span>
        <span className="flex-1" />
        <Legend />
        {!compact && (
          <span className="flex gap-1" role="group" aria-label="Show">
            {(['hours', 'tasks'] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                className={`rounded-[3px] px-2 py-0.5 text-xs font-medium ${
                  unit === u ? 'bg-teal-soft text-teal' : 'text-muted hover:bg-btn'
                }`}
                onClick={() => setUnit(u)}
              >
                {u === 'hours' ? 'Hours' : 'Tasks'}
              </button>
            ))}
          </span>
        )}
      </figcaption>
      <div aria-hidden style={{ height: compact ? 150 : 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{
              top: compact ? 8 : 22,
              right: 12,
              bottom: compact ? 0 : 18,
              left: compact ? -12 : 8,
            }}
          >
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={axisTick}
              stroke="var(--color-line)"
              tickLine={false}
              minTickGap={16}
              label={
                compact
                  ? undefined
                  : { value: 'Date', position: 'insideBottom', offset: -12, ...axisTick }
              }
            />
            <YAxis
              allowDecimals={unit === 'hours'}
              tick={axisTick}
              stroke="var(--color-line)"
              tickLine={false}
              width={compact ? 40 : 48}
              label={
                compact
                  ? undefined
                  : {
                      value: yTitle,
                      angle: -90,
                      position: 'insideLeft',
                      offset: 4,
                      dy: 50,
                      ...axisTick,
                    }
              }
            />
            {points.some((p) => p.date === today) && (
              <ReferenceLine
                x={today}
                stroke="var(--color-muted)"
                strokeOpacity={0.5}
                label={compact ? undefined : { value: 'Today', position: 'top', ...axisTick }}
              />
            )}
            <Tooltip
              content={(props) => <ChartTooltip {...props} unit={unit} />}
              cursor={{ stroke: 'var(--color-muted)', strokeWidth: 1 }}
            />
            <Line
              type="linear"
              dataKey="ideal"
              stroke="var(--color-muted)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="remaining"
              stroke="var(--color-teal)"
              strokeWidth={2}
              dot={compact ? false : { r: 3, strokeWidth: 0, fill: 'var(--color-teal)' }}
              activeDot={{ r: 5, stroke: 'var(--color-panel)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* The figures for screen readers. */}
      <table className="sr-only">
        <caption>
          {data.sprint.name}: {yTitle.toLowerCase()} per day
        </caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Remaining</th>
            <th>Ideal</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{shortDate(p.date)}</td>
              <td>{p.remaining === null ? '–' : unitLabel(unit, p.remaining)}</td>
              <td>{unitLabel(unit, p.ideal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
