import { describe, expect, it } from 'vitest';
import type { Lead } from './api';
import { followUpDue, formatInr, pipelineSummary } from './leads';

const lead = (over: Partial<Lead>): Lead => ({
  id: Math.random().toString(36),
  company: 'Acme',
  contactName: 'A Person',
  contactEmail: null,
  contactPhone: null,
  source: 'OTHER',
  stage: 'NEW',
  priority: 'MEDIUM',
  estimatedValue: null,
  expectedCloseDate: null,
  nextFollowUp: null,
  notes: null,
  lostReason: null,
  owner: null,
  createdBy: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});

describe('pipeline summary', () => {
  const now = new Date('2026-10-23T09:00:00Z');
  const leads = [
    lead({
      stage: 'PROPOSAL',
      priority: 'HIGH',
      estimatedValue: '2600000',
      nextFollowUp: '2026-10-20',
    }),
    lead({ stage: 'NEW', estimatedValue: '400000', nextFollowUp: '2026-11-02' }),
    lead({
      stage: 'WON',
      priority: 'HIGH',
      estimatedValue: '5500000',
      expectedCloseDate: '2026-10-17',
    }),
    lead({ stage: 'WON', estimatedValue: '1000000', expectedCloseDate: '2026-09-10' }),
    lead({
      stage: 'LOST',
      priority: 'HIGH',
      estimatedValue: '2000000',
      nextFollowUp: '2026-10-01',
    }),
  ];

  it('counts open value and high-priority leads, leaving won and lost out', () => {
    const s = pipelineSummary(leads, now);
    expect(s.openCount).toBe(2);
    expect(s.openValue).toBe(3_000_000);
    expect(s.highPriority).toBe(1);
  });

  it('only counts follow-ups on open leads', () => {
    expect(pipelineSummary(leads, now).followUpsDue).toBe(1);
    expect(followUpDue(leads[4])).toBe(false); // lost
  });

  it('adds up value won this month and counts every stage', () => {
    const s = pipelineSummary(leads, now);
    expect(s.wonThisMonth).toBe(5_500_000);
    expect(s.byStage).toMatchObject({ NEW: 1, PROPOSAL: 1, WON: 2, LOST: 1, QUALIFIED: 0 });
  });

  it('formats rupees the Indian way', () => {
    expect(formatInr('4800000')).toBe('₹48,00,000');
    expect(formatInr(null)).toBe('—');
  });
});
