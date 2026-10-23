import { describe, expect, it } from 'vitest';
import { healthOf, periodOf } from '../src/modules/reports/report.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('periodOf', () => {
  it('uses Monday to Sunday weeks', () => {
    const p = periodOf('week', d('2026-10-23')); // a Friday
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-10-19', '2026-10-25']);
    expect(p.label).toBe('Week 43 · 19 Oct – 25 Oct 2026');
    expect([p.previous, p.next]).toEqual(['2026-10-18', '2026-10-26']);
  });

  it('uses calendar months', () => {
    const p = periodOf('month', d('2026-02-14'));
    expect([iso(p.start), iso(p.end)]).toEqual(['2026-02-01', '2026-02-28']);
    expect(p.label).toBe('February 2026');
  });
});

describe('healthOf', () => {
  const base = { blocked: 0, blockedCritical: 0, overdue: 0, loggedHours: 10, estimateHours: 100 };

  it('is green with nothing blocked, overdue or over budget', () => {
    expect(healthOf(base).rag).toBe('green');
  });

  it('is amber for a blocked or overdue task, or hours near the estimate', () => {
    expect(healthOf({ ...base, blocked: 1 }).rag).toBe('amber');
    expect(healthOf({ ...base, overdue: 2 }).rag).toBe('amber');
    expect(healthOf({ ...base, loggedHours: 90 }).rag).toBe('amber');
  });

  it('is red for a blocked critical task, 3+ overdue, or hours above the estimate', () => {
    expect(healthOf({ ...base, blocked: 1, blockedCritical: 1 }).rag).toBe('red');
    expect(healthOf({ ...base, overdue: 3 }).rag).toBe('red');
    expect(healthOf({ ...base, loggedHours: 101 }).rag).toBe('red');
  });

  it('explains the rating', () => {
    expect(healthOf({ ...base, overdue: 1, loggedHours: 95 }).reasons).toEqual([
      '1 task overdue',
      'Hours logged are 95% of the estimate',
    ]);
  });
});
