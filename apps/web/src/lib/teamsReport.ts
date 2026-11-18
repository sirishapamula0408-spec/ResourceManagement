import type PptxGenJS from 'pptxgenjs';
import { ROLE_LABEL, type Person, type Project, type Team } from './api';
import { csvField } from './reportCsv';
import { buildXlsx, downloadBlob, type Cell, type Sheet } from './reportXlsx';

/**
 * Teams report: who is on which team and which projects they are staffed on.
 * Excel has two sheets (By team, By project); CSV holds the By team table; PowerPoint has a
 * slide per team plus a projects summary. Built in the browser from data the page already has.
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

// SedHub palette (hex without #, as pptxgenjs expects); same as the status report deck.
const C = { ink: '17233B', muted: '5C6878', line: 'D6DCD6', bg: 'EEF1EE', teal: '0E8A8C' };
const FONT = 'Segoe UI';

type Row = PptxGenJS.TableRow;
const headCell = (text: string) => ({
  text,
  options: { bold: true, color: C.muted, fill: { color: C.bg } },
});

/** A table that continues onto extra slides when it runs long. */
function addTable(slide: PptxGenJS.Slide, rows: Row[], colW: number[]) {
  slide.addTable(rows, {
    x: 0.5,
    y: 1.25,
    w: 12.3,
    colW,
    fontSize: 10,
    fontFace: FONT,
    color: C.ink,
    border: { type: 'solid', pt: 0.5, color: C.line },
    valign: 'middle',
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageHeaderRows: 1,
    autoPageSlideStartY: 0.6,
    newSlideStartY: 0.6,
  } as PptxGenJS.TableProps);
}

function slideTitle(slide: PptxGenJS.Slide, title: string, subtitle: string) {
  slide.addText(title, {
    x: 0.5,
    y: 0.3,
    w: 12.3,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  slide.addText(subtitle, {
    x: 0.5,
    y: 0.78,
    w: 12.3,
    h: 0.35,
    fontSize: 12,
    color: C.muted,
    fontFace: FONT,
  });
}

/** Build the presentation (no download); exported for tests. */
export async function buildTeamsPptx(data: TeamsReportData): Promise<PptxGenJS> {
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
  pptx.defineSlideMaster({
    title: 'TEAMS',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 7.1, w: 13.33, h: 0.4, fill: { color: C.bg } } },
      {
        text: {
          text: `SedHub · Teams report · ${generated}`,
          options: { x: 0.5, y: 7.13, w: 8, h: 0.32, fontSize: 9, color: C.muted, fontFace: FONT },
        },
      },
    ],
    slideNumber: { x: 12.3, y: 7.13, w: 0.6, h: 0.32, fontSize: 9, color: C.muted, fontFace: FONT },
  });

  const teams = teamsWithPeople(data);
  const realTeams = teams.filter((t) => t.name !== NO_TEAM).length;

  // Title
  const title = pptx.addSlide();
  title.background = { color: C.bg };
  title.addText('SedHub', {
    x: 0.8,
    y: 1.55,
    w: 6,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  title.addText('Teams and project staffing', {
    x: 0.8,
    y: 2.6,
    w: 11.5,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: C.teal,
    fontFace: FONT,
  });
  title.addText('Teams report', {
    x: 0.8,
    y: 3.15,
    w: 11.5,
    h: 0.9,
    fontSize: 40,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  title.addText(
    `${realTeams} team${realTeams === 1 ? '' : 's'} · ${data.people.length} ${data.people.length === 1 ? 'person' : 'people'} · ${data.projects.length} project${data.projects.length === 1 ? '' : 's'} · generated ${generated}`,
    { x: 0.8, y: 4.1, w: 11.5, h: 0.4, fontSize: 13, color: C.muted, fontFace: FONT },
  );

  // Projects summary: who is on each project and their teams.
  const teamNames = teamNamesByPerson(data.teams);
  const summary = pptx.addSlide({ masterName: 'TEAMS' });
  slideTitle(summary, 'Projects', 'Team members staffed on each project');
  const people = [...data.people].sort(byName);
  addTable(
    summary,
    [
      [headCell('Project'), headCell('Members'), headCell('Team members')],
      ...[...data.projects]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((pr): Row => {
          const on = people.filter((p) => p.projects.some((x) => x.id === pr.id));
          return [
            { text: `${pr.code} · ${pr.name}`, options: { bold: true } },
            { text: String(on.length), options: { align: 'center' } },
            {
              text: on.length
                ? on
                    .map((p) => `${p.name} (${(teamNames.get(p.id) ?? [NO_TEAM]).join(', ')})`)
                    .join('; ')
                : 'No members',
            },
          ];
        }),
    ],
    [3.2, 1.1, 8],
  );

  // One slide per team.
  for (const team of teams) {
    const s = pptx.addSlide({ masterName: 'TEAMS' });
    const leads = team.members.filter((m) => m.isLead).map((m) => m.person.name);
    slideTitle(
      s,
      team.name,
      `${team.members.length} member${team.members.length === 1 ? '' : 's'}${leads.length ? ` · Lead: ${leads.join(', ')}` : ''}`,
    );
    addTable(
      s,
      [
        [headCell('Member'), headCell('Title'), headCell('Department'), headCell('Projects')],
        ...(team.members.length
          ? team.members.map(({ isLead, person: p }): Row => [
              { text: isLead ? `${p.name} (Lead)` : p.name, options: { bold: isLead } },
              { text: p.title ?? '' },
              { text: p.department?.name ?? '' },
              {
                text: p.projects.length
                  ? [...p.projects]
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map((pr) => `${pr.code} · ${pr.name}`)
                      .join(', ')
                  : 'No project',
              },
            ])
          : [[{ text: 'No members yet', options: { colspan: 4, color: C.muted } }] as Row]),
      ],
      [3, 2.6, 2.2, 4.5],
    );
  }
  return pptx;
}

export async function downloadTeamsPptx(data: TeamsReportData) {
  const pptx = await buildTeamsPptx(data);
  await pptx.writeFile({ fileName: teamsReportFileName('pptx') });
}
