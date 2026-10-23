import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ProjectReport, StatusReport } from './api';
import { buildReportPptx } from './reportPptx';

const task = (key: string, title: string) => ({
  key,
  title,
  status: 'IN_PROGRESS' as const,
  priority: 'HIGH' as const,
  assignee: 'Liam Chen',
  dueDate: '2026-10-30',
  completedAt: null,
  estimateHours: 8,
});

const project = (code: string, rag: 'green' | 'amber' | 'red', inProgress = 2): ProjectReport => ({
  project: {
    id: code,
    code,
    name: `${code} project`,
    client: 'Acme',
    billable: true,
    status: 'ACTIVE',
    owner: 'Priya Sharma',
  },
  health: {
    rag,
    reasons: [rag === 'red' ? '1 critical task blocked' : 'No blocked or overdue tasks'],
  },
  metrics: {
    completed: 1,
    open: 3,
    inProgress,
    blocked: 0,
    overdue: 0,
    plannedHours: 40,
    loggedHours: 22.5,
    estimateToDate: 200,
    loggedToDate: 80,
  },
  completed: [
    { ...task(`${code}-1`, 'Finished thing'), status: 'DONE', completedAt: '2026-10-21' },
  ],
  inProgress: Array.from({ length: inProgress }, (_, i) =>
    task(`${code}-${i + 2}`, `Work item ${i + 1}`),
  ),
  dueNext: [],
  blocked: [],
  overdue: [],
  team: [{ name: 'Liam Chen', loggedHours: 22.5, plannedHours: 30 }],
});

const report = (projects: ProjectReport[]): StatusReport => ({
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
  totals: {
    projects: projects.length,
    red: 1,
    amber: 0,
    green: 1,
    completed: 2,
    loggedHours: 45,
    plannedHours: 80,
    overdue: 0,
    blocked: 0,
  },
  projects,
});

async function slidesOf(r: StatusReport) {
  const pptx = await buildReportPptx(r);
  const data = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  return Promise.all(names.map((n) => zip.file(n)!.async('string')));
}

describe('PowerPoint export', () => {
  it('has a title, portfolio, one slide per project and the health rules', async () => {
    const slides = await slidesOf(report([project('ATLAS', 'green'), project('NOVA', 'red')]));
    expect(slides).toHaveLength(5);
    expect(slides[0]).toContain('Weekly project status report');
    expect(slides[0]).toContain('Week 43');
    expect(slides[1]).toContain('Portfolio summary');
    expect(slides[1]).toContain('Off track');
    expect(slides[2]).toContain('ATLAS · ATLAS project');
    expect(slides[2]).toContain('TEAM EFFORT THIS WEEK');
    expect(slides[3]).toContain('1 critical task blocked');
    expect(slides[4]).toContain('How health is worked out');
  });

  it('skips the portfolio slide for a single project and summarises long lists', async () => {
    const slides = await slidesOf(report([project('ORION', 'amber', 9)]));
    expect(slides).toHaveLength(3);
    expect(slides[1]).toContain('more in the full report');
  });
});
