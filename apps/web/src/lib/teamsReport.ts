import type PptxGenJS from 'pptxgenjs';
import { ROLE_LABEL, type Person, type Project, type Team } from './api';
import { csvField } from './reportCsv';
import { buildXlsx, downloadBlob, type Cell, type Sheet } from './reportXlsx';
import {
  banded,
  C,
  defineMaster,
  headCell,
  MASTER,
  slideTitle,
  tableStyle,
  titleSlide,
} from './pptxTheme';
import { sedhubLogoPng } from './sedhubLogo';

/**
 * Teams report: who is on which team and which projects they are staffed on.
 * Excel has two sheets (By team, By project); CSV holds the By team table; PowerPoint has a
 * title slide (with the SedHub logo) and a projects summary. Built in the browser from data the page already has.
 */

export interface TeamsReportData {
  teams: Team[];
  people: Person[];
  projects: Pick<Project, 'id' | 'code' | 'name'>[];
  generatedAt?: Date;
}

const NO_TEAM = 'No team';
const NONE = '—';

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/** Teams with their members resolved to full person records (removed people are skipped). */
function teamsWithPeople({ teams, people }: TeamsReportData) {
  const personById = new Map(people.map((p) => [p.id, p]));
  const resolved = [...teams].sort(byName).map((t) => ({
    name: t.name,
    members: t.members
      .map((m) => ({ isLead: m.isLead, person: personById.get(m.person.id) }))
      .filter((m): m is { isLead: boolean; person: Person } => !!m.person),
  }));
  const onATeam = new Set(resolved.flatMap((t) => t.members.map((m) => m.person.id)));
  const loners = people.filter((p) => !onATeam.has(p.id)).sort(byName);
  if (loners.length) {
    resolved.push({ name: NO_TEAM, members: loners.map((person) => ({ isLead: false, person })) });
  }
  return resolved;
}

/** "Platform (Lead), Data" for each person. */
function teamNamesByPerson(teams: Team[]) {
  const names = new Map<string, string[]>();
  for (const t of [...teams].sort(byName)) {
    for (const m of t.members) {
      const list = names.get(m.person.id) ?? [];
      list.push(m.isLead ? `${t.name} (Lead)` : t.name);
      names.set(m.person.id, list);
    }
  }
  return names;
}

const BY_TEAM_HEADER = [
  'Team',
  'Member',
  'Team lead',
  'Role',
  'Title',
  'Department',
  'Email',
  'Project key',
  'Project',
];

/** One row per team, member and project (a member on no project gets one row). */
export function byTeamRows(data: TeamsReportData): Cell[][] {
  return teamsWithPeople(data).flatMap((team) =>
    team.members.flatMap(({ isLead, person: p }) => {
      const base = [
        team.name,
        p.name,
        isLead ? 'Yes' : '',
        ROLE_LABEL[p.role],
        p.title,
        p.department?.name,
        p.email,
      ];
      const projects = [...p.projects].sort((a, b) => a.code.localeCompare(b.code));
      return projects.length
        ? projects.map((pr) => [...base, pr.code, pr.name])
        : [[...base, NONE, 'No project']];
    }),
  );
}

/** One row per project and member; projects with nobody on them, and people on none, still show. */
export function byProjectRows({ teams, people, projects }: TeamsReportData): Cell[][] {
  const teamNames = teamNamesByPerson(teams);
  const row = (code: string, project: string, p: Person): Cell[] => [
    code,
    project,
    p.name,
    (teamNames.get(p.id) ?? [NO_TEAM]).join(', '),
    ROLE_LABEL[p.role],
    p.title,
    p.department?.name,
  ];
  const sortedPeople = [...people].sort(byName);
  const rows = [...projects]
    .sort((a, b) => a.code.localeCompare(b.code))
    .flatMap((pr) => {
      const on = sortedPeople.filter((p) => p.projects.some((x) => x.id === pr.id));
      return on.length
        ? on.map((p) => row(pr.code, pr.name, p))
        : [[pr.code, pr.name, 'No members', '', '', '', '']];
    });
  const unstaffed = sortedPeople.filter((p) => !p.projects.length);
  return [...rows, ...unstaffed.map((p) => row(NONE, 'No project', p))];
}

export function teamsReportSheets(data: TeamsReportData): Sheet[] {
  return [
    {
      name: 'By team',
      header: BY_TEAM_HEADER,
      rows: byTeamRows(data),
      widths: [20, 22, 10, 16, 22, 18, 30, 11, 28],
    },
    {
      name: 'By project',
      header: ['Project key', 'Project', 'Member', 'Team(s)', 'Role', 'Title', 'Department'],
      rows: byProjectRows(data),
      widths: [11, 28, 22, 30, 16, 22, 18],
    },
  ];
}

/** The By team table as CSV (a CSV file holds one table). */
export function teamsReportCsv(data: TeamsReportData): string {
  return (
    [BY_TEAM_HEADER, ...byTeamRows(data)]
      .map((r) => r.map((v) => csvField(v)).join(','))
      .join('\r\n') + '\r\n'
  );
}

/** e.g. "teams-report-2026-11-18.xlsx". */
export const teamsReportFileName = (ext: 'csv' | 'xlsx' | 'pptx', date = new Date()) =>
  `teams-report-${date.toISOString().slice(0, 10)}.${ext}`;

export async function downloadTeamsXlsx(data: TeamsReportData) {
  downloadBlob(await buildXlsx(teamsReportSheets(data)), teamsReportFileName('xlsx'));
}

// ---- PowerPoint ----

type Row = PptxGenJS.TableRow;

// Table layout in inches: 12 pt text is about 0.2 in a line, plus cell margins.
const TABLE_TOP = 1.35;
const TABLE_BOTTOM = 6.85; // above the footer line
const HEAD_H = 0.38;
const LINE_H = 0.2;
const ROW_PAD = 0.18;
/** Most lines one row can hold on a slide. */
const MAX_LINES = Math.floor((TABLE_BOTTOM - TABLE_TOP - HEAD_H - ROW_PAD) / LINE_H);

function addTable(slide: PptxGenJS.Slide, header: Row, body: Row[], colW: number[], first = 0) {
  slide.addTable([header, ...banded(body, first)], {
    x: 0.5,
    y: TABLE_TOP,
    w: 12.3,
    colW,
    fontSize: 12,
    margin: 0.08,
    ...tableStyle,
  });
}

/**
 * Split rows into slide-sized pages, never splitting a row across slides. Each row is given
 * as its line count; a row taller than a slide must be split by the caller first.
 */
export function pageRows(lineCounts: number[]): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = HEAD_H;
  lineCounts.forEach((lines, i) => {
    const h = Math.max(1, lines) * LINE_H + ROW_PAD;
    if (page.length && TABLE_TOP + used + h > TABLE_BOTTOM) {
      pages.push(page);
      page = [];
      used = HEAD_H;
    }
    page.push(i);
    used += h;
  });
  if (page.length) pages.push(page);
  return pages;
}

export interface TeamsPptxOptions {
  /** The SedHub mark as an image data URL, for the title slide (see sedhubLogoPng). */
  logo?: string | null;
}

/** Build the presentation (no download); exported for tests. */
export async function buildTeamsPptx(
  data: TeamsReportData,
  { logo }: TeamsPptxOptions = {},
): Promise<PptxGenJS> {
  const { default: Pptx } = await import('pptxgenjs');
  const pptx = new Pptx();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.author = 'SedHub';
  pptx.title = 'Teams report';
  const generated = (data.generatedAt ?? new Date()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  defineMaster(pptx, `SedHub · Teams report · ${generated}`);

  const realTeams = data.teams.length;
  titleSlide(pptx, {
    heading: 'Teams report',
    subtitle: 'Team members and the projects they are staffed on',
    meta: `${realTeams} team${realTeams === 1 ? '' : 's'} · ${data.people.length} ${data.people.length === 1 ? 'person' : 'people'} · ${data.projects.length} project${data.projects.length === 1 ? '' : 's'} · generated ${generated}`,
    logo,
  });

  // Each person's teams, e.g. "Platform (Lead)".
  const teamNames = teamNamesByPerson(data.teams);
  const people = [...data.people].sort(byName);

  /** Slides for one table, paged by whole rows; later slides are titled "(continued)". */
  const tableSlides = (
    title: string,
    subtitle: string,
    header: Row,
    rows: { cells: Row; lines: number }[],
    colW: number[],
    empty: string,
  ) => {
    const pages = rows.length ? pageRows(rows.map((r) => r.lines)) : [[]];
    pages.forEach((page, n) => {
      const slide = pptx.addSlide({ masterName: MASTER });
      slideTitle(slide, n ? `${title} (continued)` : title, subtitle);
      addTable(
        slide,
        header,
        page.length
          ? page.map((i) => rows[i].cells)
          : [[{ text: empty, options: { colspan: header.length } }]],
        colW,
        page[0] ?? 0,
      );
    });
  };
  const muted = { color: C.muted, italic: true };

  // Projects: the team members on each. A project with more members than fit on a slide is
  // split into parts, the later ones marked "(continued)".
  const projectRows = [...data.projects]
    .sort((a, b) => a.code.localeCompare(b.code))
    .flatMap((pr, n) => {
      const label = `${pr.code} · ${pr.name}`;
      const names = people.filter((p) => p.projects.some((x) => x.id === pr.id)).map((p) => p.name);
      const parts = [];
      for (let i = 0; i < Math.max(1, names.length); i += MAX_LINES) {
        const chunk = names.slice(i, i + MAX_LINES);
        parts.push({
          lines: chunk.length,
          cells: [
            { text: i ? '' : String(n + 1), options: { align: 'center' } },
            { text: i ? `${label} (continued)` : label, options: { bold: true, color: C.ink } },
            { text: i ? '' : String(names.length), options: { align: 'center' } },
            chunk.length ? { text: chunk.join('\n') } : { text: 'No members', options: muted },
          ] as Row,
        });
      }
      return parts;
    });
  tableSlides(
    'Projects',
    'Team members staffed on each project',
    [
      headCell('#', 'center'),
      headCell('Project'),
      headCell('Members', 'center'),
      headCell('Team members'),
    ],
    projectRows,
    [0.6, 3.3, 1.2, 7.2],
    'No projects',
  );

  // All team members: everyone, with their team(s) and projects.
  const memberRows = people.map((p, n) => {
    const projects = [...p.projects]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((pr) => `${pr.code} · ${pr.name}`);
    return {
      lines: Math.min(projects.length, MAX_LINES),
      cells: [
        { text: String(n + 1), options: { align: 'center' } },
        { text: p.name, options: { bold: true, color: C.ink } },
        { text: p.title ?? '' },
        { text: p.department?.name ?? '' },
        teamNames.has(p.id)
          ? { text: teamNames.get(p.id)!.join('\n') }
          : { text: NO_TEAM, options: muted },
        projects.length
          ? { text: projects.slice(0, MAX_LINES).join('\n') }
          : { text: 'No project', options: muted },
      ] as Row,
    };
  });
  // A row's height is set by its tallest cell (projects or teams).
  memberRows.forEach((r, i) => {
    r.lines = Math.max(r.lines, teamNames.get(people[i].id)?.length ?? 1);
  });
  tableSlides(
    'All team members',
    `${people.length} ${people.length === 1 ? 'person' : 'people'} with their teams and projects`,
    [
      headCell('#', 'center'),
      headCell('Member'),
      headCell('Title'),
      headCell('Department'),
      headCell('Team'),
      headCell('Projects'),
    ],
    memberRows,
    [0.6, 2.4, 2.3, 1.9, 1.9, 3.2],
    'No people',
  );

  return pptx;
}

export async function downloadTeamsPptx(data: TeamsReportData) {
  const pptx = await buildTeamsPptx(data, { logo: await sedhubLogoPng() });
  await pptx.writeFile({ fileName: teamsReportFileName('pptx') });
}
