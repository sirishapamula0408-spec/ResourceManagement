import type { StatusReport } from './api';

const RAG_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' } as const;

/** Quote a CSV field when it contains a comma, quote or line break (RFC 4180). */
export function csvField(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per project with the report's figures, ready for Excel. */
export function reportToCsv(report: StatusReport): string {
  const header = [
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
  ];
  const rows = report.projects.map((p) => [
    report.period.label,
    report.period.start,
    report.period.end,
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
  ]);
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** e.g. "project-status-2026-W43.csv" or "project-status-2026-10.pptx". */
export function reportFileName(report: StatusReport, ext: 'csv' | 'pptx' = 'csv'): string {
  const { type, start, label } = report.period;
  if (type === 'month') return `project-status-${start.slice(0, 7)}.${ext}`;
  const week = label.match(/Week (\d+)/)?.[1] ?? start;
  return `project-status-${start.slice(0, 4)}-W${week.padStart(2, '0')}.${ext}`;
}

/** Save text as a file through the browser. */
export function downloadText(fileName: string, text: string, type = 'text/csv') {
  // A byte-order mark makes Excel read the file as UTF-8 (en dashes, accented names).
  const blob = new Blob(['﻿', text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
