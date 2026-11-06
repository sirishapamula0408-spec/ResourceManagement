import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { StatusReport } from './api';
import { buildReportXlsx, columnName, reportSheets } from './reportXlsx';

const report = {
  period: {
    type: 'week',
    start: '2026-10-19',
    end: '2026-10-25',
    label: 'Week 43 · 19 Oct – 25 Oct 2026',
  },
  projects: [
    {
      project: {
        id: 'p1',
        code: 'ATLAS',
        name: 'Atlas <Portal> & API',
        client: 'Acme',
        billable: true,
        status: 'ACTIVE',
        owner: 'Priya Sharma',
      },
      health: { rag: 'amber', reasons: ['1 task overdue', 'Over estimate'] },
      metrics: {
        completed: 1,
        open: 3,
        inProgress: 1,
        blocked: 0,
        overdue: 1,
        plannedHours: 40,
        loggedHours: 22.5,
        estimateToDate: 200,
        loggedToDate: 80,
      },
      completed: [],
      inProgress: [
        {
          key: 'ATLAS-2',
          title: 'Build the form',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          assignee: 'Liam Chen',
          dueDate: '2026-10-30',
          completedAt: null,
          estimateHours: 8,
        },
      ],
      dueNext: [],
      blocked: [],
      overdue: [
        {
          key: 'ATLAS-3',
          title: 'Late thing',
          status: 'TODO',
          priority: 'CRITICAL',
          assignee: null,
          dueDate: '2026-10-20',
          completedAt: null,
          estimateHours: 4,
        },
      ],
      team: [{ name: 'Liam Chen', loggedHours: 22.5, plannedHours: 30 }],
    },
  ],
} as unknown as StatusReport;

describe('Excel export', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('has a Projects, a Tasks and a Team hours sheet', () => {
    const [projects, tasks, team] = reportSheets(report);
    expect(projects.rows[0].slice(3, 10)).toEqual([
      'ATLAS',
      'Atlas <Portal> & API',
      'Acme',
      'Yes',
      'Priya Sharma',
      'At risk',
      '1 task overdue; Over estimate',
    ]);
    // Figures stay numbers, so Excel can add them up.
    expect(projects.rows[0].slice(-4)).toEqual([22.5, 40, 80, 200]);
    expect(tasks.rows).toEqual([
      [
        'ATLAS',
        'In progress',
        'ATLAS-2',
        'Build the form',
        'In progress',
        'High',
        'Liam Chen',
        '2026-10-30',
        undefined,
        8,
      ],
      [
        'ATLAS',
        'Overdue',
        'ATLAS-3',
        'Late thing',
        'To do',
        'Critical',
        null,
        '2026-10-20',
        undefined,
        4,
      ],
    ]);
    expect(team.rows).toEqual([['ATLAS', 'Atlas <Portal> & API', 'Liam Chen', 22.5, 30]]);
  });

  it('writes a valid workbook with escaped text and numeric cells', async () => {
    const zip = await JSZip.loadAsync(await (await buildReportXlsx(report)).arrayBuffer());
    const workbook = await zip.file('xl/workbook.xml')!.async('string');
    expect(workbook).toContain('<sheet name="Projects" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('<sheet name="Team hours" sheetId="3" r:id="rId3"/>');
    const sheet1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet1).toContain('Atlas &lt;Portal&gt; &amp; API');
    expect(sheet1).toContain('<c r="P2"><v>22.5</v></c>');
    expect(sheet1).toContain('<autoFilter ref="A1:S2"/>');
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain(
      '/xl/worksheets/sheet3.xml',
    );
  });
});
