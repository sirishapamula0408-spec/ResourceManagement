import { describe, expect, it } from 'vitest';
import { bandOf, spreadTaskHours, utilizationPct } from '../src/modules/dashboard/utilization.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('spreadTaskHours', () => {
  it('spreads the estimate evenly over working days, split by week', () => {
    // Thu 2026-10-22 .. Wed 2026-10-28: Thu, Fri | Mon, Tue, Wed = 5 working days
    const hours = spreadTaskHours({
      estimateHours: 10,
      startDate: d('2026-10-22'),
      dueDate: d('2026-10-28'),
    });
    expect(Object.fromEntries(hours)).toEqual({ '2026-10-19': 4, '2026-10-26': 6 });
  });

  it('skips weekends', () => {
    // Fri .. Mon = 2 working days across two weeks
    const hours = spreadTaskHours({
      estimateHours: 8,
      startDate: d('2026-10-23'),
      dueDate: d('2026-10-26'),
    });
    expect(Object.fromEntries(hours)).toEqual({ '2026-10-19': 4, '2026-10-26': 4 });
  });

  it('puts a single-day task entirely in its week', () => {
    const hours = spreadTaskHours({
      estimateHours: 6,
      startDate: d('2026-10-21'),
      dueDate: d('2026-10-21'),
    });
    expect(Object.fromEntries(hours)).toEqual({ '2026-10-19': 6 });
  });

  it('schedules nothing for weekend-only, reversed or zero-estimate tasks', () => {
    expect(
      spreadTaskHours({ estimateHours: 8, startDate: d('2026-10-24'), dueDate: d('2026-10-25') })
        .size,
    ).toBe(0);
    expect(
      spreadTaskHours({ estimateHours: 8, startDate: d('2026-10-28'), dueDate: d('2026-10-22') })
        .size,
    ).toBe(0);
    expect(
      spreadTaskHours({ estimateHours: 0, startDate: d('2026-10-22'), dueDate: d('2026-10-28') })
        .size,
    ).toBe(0);
  });

  it('conserves the total estimate', () => {
    const hours = spreadTaskHours({
      estimateHours: 37,
      startDate: d('2026-10-01'),
      dueDate: d('2026-11-17'),
    });
    const total = [...hours.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(37, 9);
  });
});

describe('utilization bands', () => {
  it('uses <50, 50-80, 80-100, >100 bands', () => {
    expect(bandOf(0)).toBe('low');
    expect(bandOf(49.9)).toBe('low');
    expect(bandOf(50)).toBe('moderate');
    expect(bandOf(79.9)).toBe('moderate');
    expect(bandOf(80)).toBe('healthy');
    expect(bandOf(100)).toBe('healthy');
    expect(bandOf(100.1)).toBe('over');
  });

  it('treats zero capacity as 0% rather than dividing by zero', () => {
    expect(utilizationPct(10, 0)).toBe(0);
    expect(utilizationPct(30, 40)).toBe(75);
  });
});
