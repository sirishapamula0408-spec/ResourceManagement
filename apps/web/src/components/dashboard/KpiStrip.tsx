import type { DashboardOverview } from '../../lib/api';
import { fmt } from '../../lib/theme';

/** Small ring gauge with the percentage in the middle. */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-line)" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${(c * v) / 100} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text
        x="20"
        y="23.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="600"
        fill="var(--color-ink)"
      >
        {Math.round(v)}%
      </text>
    </svg>
  );
}

function Kpi({
  label,
  value,
  unit,
  ring,
  valueClass = '',
}: {
  label: string;
  value: string | number;
  unit: string;
  ring?: { pct: number; color: string };
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-panel px-4 py-3.5">
      {ring && <Ring {...ring} />}
      <div>
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className={`text-[22px] font-bold tracking-tight ${valueClass}`}>
          {value}
          <small className="ml-[3px] text-xs font-medium text-muted">{unit}</small>
        </div>
      </div>
    </div>
  );
}

export function KpiStrip({ kpis }: { kpis: DashboardOverview['kpis'] }) {
  const total = kpis.totalDemandHours;
  const share = (h: number) => (total ? (h / total) * 100 : 0);
  const of = `of ${kpis.teamSize}`;
  return (
    <section
      aria-label="Key figures"
      className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 xl:grid-cols-6"
    >
      <Kpi
        label="Total demand"
        value={fmt(total, 1)}
        unit="hrs"
        ring={{ pct: 100, color: 'var(--color-ink)' }}
      />
      <Kpi
        label="Billable demand"
        value={fmt(kpis.billableDemandHours, 1)}
        unit="hrs"
        ring={{ pct: share(kpis.billableDemandHours), color: 'var(--color-teal)' }}
      />
      <Kpi
        label="Non-billable demand"
        value={fmt(kpis.nonBillableDemandHours, 1)}
        unit="hrs"
        ring={{ pct: share(kpis.nonBillableDemandHours), color: 'var(--color-amber)' }}
      />
      <Kpi
        label="Under-utilized this week"
        value={kpis.underUtilized}
        unit={of}
        valueClass="text-amber"
      />
      <Kpi
        label="Over-utilized this week"
        value={kpis.overUtilized}
        unit={of}
        valueClass="text-plum"
      />
      <Kpi label="On bench this week" value={kpis.onBench} unit={of} valueClass="text-blue" />
    </section>
  );
}
