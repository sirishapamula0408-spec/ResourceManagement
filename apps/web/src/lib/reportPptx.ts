import type PptxGenJS from 'pptxgenjs';
import type { ProjectReport, Rag, ReportTask, StatusReport } from './api';

/**
 * PowerPoint export of a status report: title, portfolio summary, one slide per project and
 * the health rules. Built in the browser with pptxgenjs, which is loaded only when exporting.
 */

// Resource Board palette (hex without #, as pptxgenjs expects).
const C = {
  ink: '17233B',
  muted: '5C6878',
  line: 'D6DCD6',
  bg: 'EEF1EE',
  panel2: 'F6F8F6',
  teal: '0E8A8C',
  amber: 'E8962A',
};
const RAG: Record<Rag, { label: string; fg: string; bg: string }> = {
  green: { label: 'On track', fg: '2F7D4A', bg: 'D6EEDB' },
  amber: { label: 'At risk', fg: 'B56F10', bg: 'FBE6C7' },
  red: { label: 'Off track', fg: 'B83A33', bg: 'F7DCD9' },
};
const FONT = 'Segoe UI';
const NBSP = String.fromCharCode(160); // PowerPoint drops plain leading spaces in a text run
const MAX_ROWS = 6; // rows per task list on a project slide; the rest are summarised
const CONTENT_BOTTOM = 6.95; // inches; the footer band starts at 7.1
const ROW_H = 0.4;

const n1 = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const n0 = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : '';

type Slide = PptxGenJS.Slide;
type Row = PptxGenJS.TableRow;

function healthPill(slide: Slide, rag: Rag, x: number, y: number) {
  slide.addText(RAG[rag].label, {
    x,
    y,
    w: 1.35,
    h: 0.34,
    shape: 'roundRect',
    rectRadius: 0.17,
    fill: { color: RAG[rag].bg },
    color: RAG[rag].fg,
    bold: true,
    fontSize: 11,
    fontFace: FONT,
    align: 'center',
    valign: 'middle',
  });
}

function heading(slide: Slide, text: string, x: number, y: number, w: number) {
  slide.addText(text.toUpperCase(), {
    x,
    y,
    w,
    h: 0.28,
    fontSize: 9,
    bold: true,
    color: C.muted,
    fontFace: FONT,
    charSpacing: 1,
  });
}

/** A compact task table, or a "none" line; returns the height used. */
function taskTable(
  slide: Slide,
  title: string,
  tasks: ReportTask[],
  dateOf: (t: ReportTask) => string | null,
  empty: string,
  x: number,
  y: number,
  w: number,
): number {
  heading(slide, `${title} · ${tasks.length}`, x, y, w);
  if (!tasks.length) {
    slide.addText(empty, {
      x,
      y: y + 0.28,
      w,
      h: 0.28,
      fontSize: 9.5,
      color: C.muted,
      fontFace: FONT,
    });
    return 0.66;
  }
  // Show as many rows as fit above the footer (at most MAX_ROWS); summarise the rest.
  const fit = Math.max(0, Math.floor((CONTENT_BOTTOM - (y + 0.3)) / ROW_H));
  const limit = Math.min(MAX_ROWS, fit);
  const shown = tasks.length <= limit ? tasks : tasks.slice(0, Math.max(0, limit - 1));
  const rows: Row[] = shown.map((t) => [
    { text: t.key, options: { bold: true, color: C.muted } },
    {
      text: [
        { text: t.title, options: { breakLine: true } },
        { text: t.assignee ?? 'Unassigned', options: { color: C.muted, fontSize: 8 } },
      ],
    },
    { text: shortDate(dateOf(t)) ?? '', options: { align: 'right', color: C.muted } },
  ]);
  if (tasks.length > shown.length) {
    rows.push([
      {
        text: `+ ${tasks.length - shown.length} more in the full report`,
        options: { colspan: 3, color: C.muted, italic: true },
      },
    ]);
  }
  const rowH = ROW_H;
  slide.addTable(rows, {
    x,
    y: y + 0.3,
    w,
    colW: [0.7, w - 1.45, 0.75],
    rowH,
    fontSize: 9,
    fontFace: FONT,
    color: C.ink,
    valign: 'middle',
    border: { type: 'solid', pt: 0.5, color: C.line },
    margin: 0.04,
  });
  return 0.3 + rows.length * rowH + 0.2;
}

function titleSlide(pptx: PptxGenJS, report: StatusReport) {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  // Brand mark: three rising bars.
  [
    [0.8, 1.55, 0.5, C.amber],
    [1.05, 1.35, 0.7, C.teal],
    [1.3, 1.1, 0.95, C.ink],
  ].forEach(([x, y, h, color]) =>
    s.addShape('rect', {
      x: x as number,
      y: y as number,
      w: 0.2,
      h: h as number,
      fill: { color: color as string },
    }),
  );
  s.addText('Resource Board', {
    x: 1.65,
    y: 1.55,
    w: 6,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  s.addText(`${report.period.type === 'week' ? 'Weekly' : 'Monthly'} project status report`, {
    x: 0.8,
    y: 2.6,
    w: 11.5,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: C.teal,
    fontFace: FONT,
  });
  s.addText(report.period.label, {
    x: 0.8,
    y: 3.15,
    w: 11.5,
    h: 0.9,
    fontSize: 40,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  const generated = new Date(report.generatedAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  s.addText(
    `Status as of ${shortDate(report.period.asOf)} · ${report.totals.projects} project${report.totals.projects === 1 ? '' : 's'} · generated ${generated}`,
    { x: 0.8, y: 4.1, w: 11.5, h: 0.4, fontSize: 13, color: C.muted, fontFace: FONT },
  );
}

function portfolioSlide(pptx: PptxGenJS, report: StatusReport) {
  const s = pptx.addSlide({ masterName: 'REPORT' });
  s.addText('Portfolio summary', {
    x: 0.5,
    y: 0.35,
    w: 8,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  s.addText(report.period.label, {
    x: 0.5,
    y: 0.82,
    w: 8,
    h: 0.3,
    fontSize: 11,
    color: C.muted,
    fontFace: FONT,
  });

  // Health counts.
  (['red', 'amber', 'green'] as const).forEach((rag, i) => {
    s.addText(
      [
        {
          text: String(report.totals[rag]),
          options: { fontSize: 26, bold: true, breakLine: true },
        },
        { text: RAG[rag].label, options: { fontSize: 11 } },
      ],
      {
        x: 0.5 + i * 2.2,
        y: 1.3,
        w: 2,
        h: 1,
        fill: { color: RAG[rag].bg },
        color: RAG[rag].fg,
        fontFace: FONT,
        align: 'center',
        valign: 'middle',
      },
    );
  });

  const header = [
    'Project',
    'Health',
    'Completed',
    'In progress',
    'Overdue',
    'Blocked',
    'Logged / planned',
    'To date / estimate',
  ];
  const rows: Row[] = [
    header.map((h) => ({
      text: h,
      options: { bold: true, color: C.muted, fill: { color: C.panel2 } },
    })),
    ...report.projects.map(({ project: p, health, metrics: m }) => [
      {
        text: [
          { text: p.code, options: { bold: true } },
          { text: `${NBSP}·${NBSP}${p.name}`, options: { color: C.muted } },
        ],
      },
      {
        text: RAG[health.rag].label,
        options: { bold: true, color: RAG[health.rag].fg, fill: { color: RAG[health.rag].bg } },
      },
      { text: String(m.completed) },
      { text: String(m.inProgress) },
      { text: String(m.overdue), options: m.overdue ? { bold: true, color: RAG.red.fg } : {} },
      { text: String(m.blocked), options: m.blocked ? { bold: true, color: RAG.red.fg } : {} },
      { text: `${n1(m.loggedHours)} / ${n1(m.plannedHours)}h` },
      { text: `${n0(m.loggedToDate)} / ${n0(m.estimateToDate)}h` },
    ]),
    [
      { text: 'All projects', options: { bold: true } },
      { text: '' },
      { text: String(report.totals.completed), options: { bold: true } },
      { text: '' },
      { text: String(report.totals.overdue), options: { bold: true } },
      { text: String(report.totals.blocked), options: { bold: true } },
      {
        text: `${n1(report.totals.loggedHours)} / ${n1(report.totals.plannedHours)}h`,
        options: { bold: true },
      },
      { text: '' },
    ],
  ];
  s.addTable(rows, {
    x: 0.5,
    y: 2.6,
    w: 12.33,
    colW: [3.6, 1.3, 1.05, 1.1, 0.95, 0.95, 1.65, 1.73],
    fontSize: 10,
    fontFace: FONT,
    color: C.ink,
    valign: 'middle',
    border: { type: 'solid', pt: 0.5, color: C.line },
    autoPage: true,
    autoPageRepeatHeader: true,
  });
}

function projectSlide(pptx: PptxGenJS, report: StatusReport, r: ProjectReport) {
  const { project: p, health, metrics: m } = r;
  const word = report.period.type === 'week' ? 'week' : 'month';
  const s = pptx.addSlide({ masterName: 'REPORT' });

  s.addText(`${p.code} · ${p.name}`, {
    x: 0.5,
    y: 0.3,
    w: 9.5,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  s.addText(
    [
      p.client,
      p.billable ? 'Billable' : 'Non-billable',
      p.owner && `Owner: ${p.owner}`,
      report.period.label,
    ]
      .filter(Boolean)
      .join(' · '),
    { x: 0.5, y: 0.78, w: 9.5, h: 0.3, fontSize: 10.5, color: C.muted, fontFace: FONT },
  );
  healthPill(s, health.rag, 11.48, 0.35);
  s.addText(health.reasons.join('\n'), {
    x: 8.3,
    y: 0.72,
    w: 4.53,
    h: 0.5,
    fontSize: 9.5,
    color: C.muted,
    fontFace: FONT,
    align: 'right',
    valign: 'top',
  });

  // Key figures.
  const metrics: [string, string, string?][] = [
    [`Completed this ${word}`, String(m.completed)],
    ['Hours logged', `${n1(m.loggedHours)}h`, `of ${n1(m.plannedHours)}h planned`],
    ['Open tasks', String(m.open), `${m.inProgress} in progress`],
    ['Overdue', String(m.overdue)],
    ['Blocked', String(m.blocked)],
    ['Hours to date', `${n0(m.loggedToDate)}h`, `of ${n0(m.estimateToDate)}h estimate`],
  ];
  const tileW = 12.33 / metrics.length;
  metrics.forEach(([label, value, note], i) => {
    s.addText(
      [
        { text: label, options: { fontSize: 9, color: C.muted, breakLine: true } },
        { text: value, options: { fontSize: 18, bold: true, color: C.ink, breakLine: !!note } },
        ...(note ? [{ text: note, options: { fontSize: 8.5, color: C.muted } }] : []),
      ],
      {
        x: 0.5 + i * tileW,
        y: 1.3,
        w: tileW - 0.08,
        h: 0.95,
        fill: { color: C.panel2 },
        line: { color: C.line, width: 0.5 },
        fontFace: FONT,
        valign: 'middle',
        margin: 8, // points
      },
    );
  });

  // Three columns: what got done and what's at risk; what's in flight; who did the work.
  const colW = 3.95;
  const gap = 0.24;
  const top = 2.5;
  const [x1, x2, x3] = [0.5, 0.5 + colW + gap, 0.5 + 2 * (colW + gap)];
  const risks = [...r.blocked, ...r.overdue.filter((t) => !r.blocked.some((b) => b.key === t.key))];

  let y = top;
  y += taskTable(
    s,
    `Completed this ${word}`,
    r.completed,
    (t) => t.completedAt,
    `Nothing completed this ${word}.`,
    x1,
    y,
    colW,
  );
  taskTable(
    s,
    'Blocked or overdue',
    risks,
    (t) => t.dueDate,
    'Nothing blocked or overdue.',
    x1,
    y,
    colW,
  );

  y = top;
  y += taskTable(
    s,
    'In progress',
    r.inProgress,
    (t) => t.dueDate,
    'Nothing in progress.',
    x2,
    y,
    colW,
  );
  taskTable(
    s,
    `Due next ${word}`,
    r.dueNext,
    (t) => t.dueDate,
    `Nothing due next ${word}.`,
    x2,
    y,
    colW,
  );

  heading(s, `Team effort this ${word}`, x3, top, colW);
  if (!r.team.length) {
    s.addText(`No time logged or planned this ${word}.`, {
      x: x3,
      y: top + 0.28,
      w: colW,
      h: 0.28,
      fontSize: 9.5,
      color: C.muted,
      fontFace: FONT,
    });
  } else {
    const rows: Row[] = [
      ['Person', 'Logged', 'Planned'].map((h, i) => ({
        text: h,
        options: {
          bold: true,
          color: C.muted,
          fill: { color: C.panel2 },
          align: (i ? 'right' : 'left') as PptxGenJS.HAlign,
        },
      })),
      ...r.team
        .slice(0, 10)
        .map((t): Row => [
          { text: t.name },
          { text: `${n1(t.loggedHours)}h`, options: { align: 'right' } },
          { text: `${n1(t.plannedHours)}h`, options: { align: 'right', color: C.muted } },
        ]),
    ];
    s.addTable(rows, {
      x: x3,
      y: top + 0.3,
      w: colW,
      colW: [colW - 1.7, 0.85, 0.85],
      rowH: 0.3,
      fontSize: 9,
      fontFace: FONT,
      color: C.ink,
      valign: 'middle',
      border: { type: 'solid', pt: 0.5, color: C.line },
      margin: 0.04,
    });
  }
}

function rulesSlide(pptx: PptxGenJS) {
  const s = pptx.addSlide({ masterName: 'REPORT' });
  s.addText('How health is worked out', {
    x: 0.5,
    y: 0.35,
    w: 12,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  const rules: [Rag, string][] = [
    [
      'red',
      'A critical task is blocked, 3 or more tasks are overdue, or hours logged exceed the total estimate.',
    ],
    ['amber', 'Any task is blocked or overdue, or hours logged reach 90% of the estimate.'],
    ['green', 'None of the above.'],
  ];
  rules.forEach(([rag, text], i) => {
    healthPill(s, rag, 0.5, 1.3 + i * 0.75);
    s.addText(text, {
      x: 2.1,
      y: 1.27 + i * 0.75,
      w: 10.5,
      h: 0.4,
      fontSize: 13,
      color: C.ink,
      fontFace: FONT,
      valign: 'middle',
    });
  });
  s.addText(
    'Planned hours spread each task’s estimate evenly over its working days, as on the dashboard. ' +
      'Completed means the task moved to Done during the period. Blocked and in-progress lists show each task’s current status.',
    { x: 0.5, y: 3.7, w: 12.3, h: 0.8, fontSize: 11, color: C.muted, fontFace: FONT },
  );
}

/** Build the presentation (no download); exported for tests. */
export async function buildReportPptx(report: StatusReport): Promise<PptxGenJS> {
  const { default: Pptx } = await import('pptxgenjs');
  const pptx = new Pptx();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.author = 'Resource Board';
  pptx.title = `Project status report · ${report.period.label}`;
  pptx.defineSlideMaster({
    title: 'REPORT',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 7.1, w: 13.33, h: 0.4, fill: { color: C.bg } } },
      {
        text: {
          text: `Resource Board · ${report.period.label}`,
          options: { x: 0.5, y: 7.13, w: 8, h: 0.32, fontSize: 9, color: C.muted, fontFace: FONT },
        },
      },
    ],
    slideNumber: { x: 12.3, y: 7.13, w: 0.6, h: 0.32, fontSize: 9, color: C.muted, fontFace: FONT },
  });

  titleSlide(pptx, report);
  if (report.projects.length > 1) portfolioSlide(pptx, report);
  report.projects.forEach((r) => projectSlide(pptx, report, r));
  rulesSlide(pptx);
  return pptx;
}

/** Build and download, e.g. "project-status-2026-W43.pptx". */
export async function downloadReportPptx(report: StatusReport, fileName: string) {
  const pptx = await buildReportPptx(report);
  await pptx.writeFile({ fileName });
}
