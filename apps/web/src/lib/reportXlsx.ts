import type { ReportTask, StatusReport } from './api';
import { STATUS_LABEL } from '../components/tasks/taskHelpers';

/**
 * Excel export of a status report: a Projects sheet (the CSV's columns, with real numbers),
 * a Tasks sheet listing every task the report names, and a Team hours sheet. Written as a
 * plain .xlsx (Office Open XML) with JSZip, which is loaded only when exporting.
 */

type Cell = string | number | null | undefined;
interface Sheet {
  name: string;
  header: string[];
  rows: Cell[][];
  /** Column widths in characters. */
  widths: number[];
}

const RAG_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' } as const;

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab and line breaks are not allowed in XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** "A", "B", … "Z", "AA", … for a 0-based column. */
export function columnName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

// Style 1 is the bold header (see STYLES).
function cellXml(value: Cell, ref: string, style = 0): string {
  const s = style ? ` s="${style}"` : '';
  if (value == null || value === '') return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number')
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : `<c r="${ref}"${s}/>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const all = [sheet.header, ...sheet.rows];
  const rows = all
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((v, c) => cellXml(v, `${columnName(c)}${r + 1}`, r === 0 ? 1 : 0)).join('')}</row>`,
    )
    .join('');
  const last = `${columnName(sheet.header.length - 1)}${all.length}`;
  const cols = sheet.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    // The header row stays in view while scrolling.
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${rows}</sheetData>` +
    `<autoFilter ref="A1:${last}"/>` +
    '</worksheet>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF1EE"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
  '</styleSheet>';

/** The report as sheets of rows; exported for tests. */
export function reportSheets(report: StatusReport): Sheet[] {
  const { period } = report;
  const projects: Sheet = {
    name: 'Projects',
    header: [
      'Period',
      'From',
      'To',
      'Project key',
      'Project',
      'Client',
      'Billable',
      'Owner',
      'Health',
      'Why',
      'Completed',
      'Open',
      'In progress',
      'Overdue',
      'Blocked',
      'Hours logged (period)',
      'Hours planned (period)',
      'Hours logged to date',
      'Estimate (hours)',
    ],
    rows: report.projects.map((p) => [
      period.label,
      period.start,
      period.end,
      p.project.code,
      p.project.name,
      p.project.client,
      p.project.billable ? 'Yes' : 'No',
      p.project.owner,
      RAG_LABEL[p.health.rag],
      p.health.reasons.join('; '),
      p.metrics.completed,
      p.metrics.open,
      p.metrics.inProgress,
      p.metrics.overdue,
      p.metrics.blocked,
      p.metrics.loggedHours,
      p.metrics.plannedHours,
      p.metrics.loggedToDate,
      p.metrics.estimateToDate,
    ]),
    widths: [30, 11, 11, 11, 28, 18, 9, 18, 10, 40, 10, 8, 11, 9, 9, 12, 12, 12, 12],
  };

  const LISTS = [
    ['Completed', 'completed'],
    ['In progress', 'inProgress'],
    ['Due next', 'dueNext'],
    ['Blocked', 'blocked'],
    ['Overdue', 'overdue'],
  ] as const;
  const taskRow = (code: string, list: string, t: ReportTask): Cell[] => [
    code,
    list,
    t.key,
    t.title,
    STATUS_LABEL[t.status],
    t.priority.charAt(0) + t.priority.slice(1).toLowerCase(),
    t.assignee,
    t.dueDate?.slice(0, 10),
    t.completedAt?.slice(0, 10),
    t.estimateHours,
  ];
  const tasks: Sheet = {
    name: 'Tasks',
    header: [
      'Project key',
      'List',
      'Task',
      'Title',
      'Status',
      'Priority',
      'Assignee',
      'Due',
      'Completed on',
      'Estimate (hours)',
    ],
    rows: report.projects.flatMap((p) =>
      LISTS.flatMap(([label, field]) => p[field].map((t) => taskRow(p.project.code, label, t))),
    ),
    widths: [11, 12, 11, 44, 12, 10, 18, 11, 13, 12],
  };

  const team: Sheet = {
    name: 'Team hours',
    header: ['Project key', 'Project', 'Person', 'Hours logged', 'Hours planned'],
    rows: report.projects.flatMap((p) =>
      p.team.map((m) => [p.project.code, p.project.name, m.name, m.loggedHours, m.plannedHours]),
    ),
    widths: [11, 28, 22, 13, 13],
  };

  return [projects, tasks, team];
}

export async function buildReportXlsx(report: StatusReport): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const sheets = reportSheets(report);
  const zip = new JSZip();
  const ns = 'http://schemas.openxmlformats.org';
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Types xmlns="${ns}/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="${ns}/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
  );
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>` +
      sheets
        .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('') +
      '</sheets>' +
      // Excel's autofilter needs a hidden defined name per sheet.
      '<definedNames>' +
      sheets
        .map(
          (s, i) =>
            `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(s.name)}'!$A$1:$${columnName(s.header.length - 1)}$${s.rows.length + 1}</definedName>`,
        )
        .join('') +
      '</definedNames></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="${ns}/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
  );
  zip.file('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  });
}

/** Build the workbook and save it through the browser. */
export async function downloadReportXlsx(report: StatusReport, fileName: string) {
  const url = URL.createObjectURL(await buildReportXlsx(report));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
