import type { Lead, LeadPriority, LeadSource, LeadStage } from './api';

/** Pipeline order; Won and Lost close a lead. */
export const LEAD_STAGES: LeadStage[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
];
export const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};
export const STAGE_CLASS: Record<LeadStage, string> = {
  NEW: 'bg-panel2 border border-line',
  CONTACTED: 'bg-blue-soft',
  QUALIFIED: 'bg-teal-soft',
  PROPOSAL: 'bg-amber-soft',
  NEGOTIATION: 'bg-plum-soft',
  WON: 'bg-green-soft text-green',
  LOST: 'bg-red-soft text-red',
};

export const LEAD_PRIORITIES: LeadPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
export const LEAD_PRIORITY_LABEL: Record<LeadPriority, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};
export const LEAD_PRIORITY_CLASS: Record<LeadPriority, string> = {
  HIGH: 'bg-plum-soft text-plum',
  MEDIUM: 'bg-amber-soft',
  LOW: 'bg-blue-soft',
};
export const LEAD_PRIORITY_RANK: Record<LeadPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const LEAD_SOURCES: LeadSource[] = [
  'REFERRAL',
  'WEBSITE',
  'EVENT',
  'OUTBOUND',
  'PARTNER',
  'OTHER',
];
export const SOURCE_LABEL: Record<LeadSource, string> = {
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  EVENT: 'Event',
  OUTBOUND: 'Outbound',
  PARTNER: 'Partner',
  OTHER: 'Other',
};

export const isOpenLead = (l: Lead) => l.stage !== 'WON' && l.stage !== 'LOST';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Follow-up date today or earlier on an open lead. */
export const followUpDue = (l: Lead) =>
  isOpenLead(l) && !!l.nextFollowUp && l.nextFollowUp.slice(0, 10) <= todayIso();

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** ₹48,00,000 */
export const formatInr = (value: string | number | null) =>
  value === null || value === '' ? '—' : inr.format(Number(value));
/** ₹48L, for summary tiles. */
export const formatInrCompact = (value: number) => inrCompact.format(value);

/** Summary figures for the pipeline. */
export function pipelineSummary(leads: Lead[], now = new Date()) {
  const open = leads.filter(isOpenLead);
  const month = now.toISOString().slice(0, 7);
  const value = (l: Lead) => Number(l.estimatedValue ?? 0);
  return {
    openCount: open.length,
    openValue: open.reduce((s, l) => s + value(l), 0),
    highPriority: open.filter((l) => l.priority === 'HIGH').length,
    followUpsDue: leads.filter(followUpDue).length,
    // Won this month: closed as won with an expected close date in the current month.
    wonThisMonth: leads
      .filter(
        (l) => l.stage === 'WON' && (l.expectedCloseDate ?? l.updatedAt).slice(0, 7) === month,
      )
      .reduce((s, l) => s + value(l), 0),
    byStage: Object.fromEntries(
      LEAD_STAGES.map((st) => [st, leads.filter((l) => l.stage === st).length]),
    ) as Record<LeadStage, number>,
  };
}
