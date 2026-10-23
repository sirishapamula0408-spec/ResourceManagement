import { describe, expect, it } from 'vitest';
import type { StatusReport } from './api';
import { csvField, reportFileName, reportToCsv } from './reportCsv';

const report = {
  period: {
    type: 'week',
    start: '2026-10-19',
    end: '2026-10-25',
    label: 'Week 43 · 19 Oct – 25 Oct 2026',
    previous: '2026-10-18',
    next: '2026-10-26',
    nextLabel: 'Week 44',
    asOf: '2026-10-23',
  },
  generatedAt: '2026-10-23T10:00:00Z',
  totals: {} as StatusReport['totals'],
  projects: [
    {
      project: {
        id: 'p1',
        code: 'ATLAS',
        name: 'Atlas, the "portal"',
        client: 'Acme Bank',
        billable: true,
        status: 'ACTIVE',
        owner: 'Priya Sharma',
      },
      health: { rag: 'amber', reasons: ['1 task blocked'] },
      metrics: {
        completed: 2,
        open: 11,
        inProgress: 6,
        blocked: 1,
        overdue: 0,
        plannedHours: 136,
        loggedHours: 22.5,
        estimateToDate: 436,
        loggedToDate: 49.5,
      },
      completed: [],
      inProgress: [],
      dueNext: [],
      blocked: [],
      overdue: [],
      team: [],
    },
  ],
} as StatusReport;

describe('report CSV', () => {
  it('quotes fields with commas, quotes or line breaks', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(null)).toBe('');
  });

  it('writes a header and one row per project', () => {
    const lines = reportToCsv(report).trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Period,From,To,Project key,Project,/);
    expect(lines[1]).toContain('ATLAS,"Atlas, the ""portal""",Acme Bank,Yes,Priya Sharma,At risk');
    expect(lines[1]).toMatch(/,22\.5,136,49\.5,436$/);
  });

  it('names weekly and monthly files by period', () => {
    expect(reportFileName(report)).toBe('project-status-2026-W43.csv');
    const monthly = { ...report, period: { ...report.period, type: 'month', start: '2026-10-01' } };
    expect(reportFileName(monthly as StatusReport)).toBe('project-status-2026-10.csv');
  });
});
