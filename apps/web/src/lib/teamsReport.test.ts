import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Person, Team } from './api';
import { buildXlsx } from './reportXlsx';
import {
  buildTeamsPptx,
  byProjectRows,
  byTeamRows,
  pageRows,
  teamsReportCsv,
  teamsReportSheets,
  type TeamsReportData,
} from './teamsReport';

const ATLAS = { id: 'p1', code: 'ATLAS', name: 'Atlas' };
const NOVA = { id: 'p2', code: 'NOVA', name: 'Nova, "next"' };
const ORION = { id: 'p3', code: 'ORION', name: 'Orion' };

const person = (id: string, name: string, projects: (typeof ATLAS)[], extra = {}): Person => ({
  id,
  name,
  email: `${id}@example.test`,
  role: 'MEMBER',
  title: 'Engineer',
  weeklyCapacityHours: '40',
  department: { id: 'd1', name: 'Engineering' },
  projects,
  ...extra,
});

const liam = person('liam', 'Liam Chen', [NOVA, ATLAS]);
const mia = person('mia', 'Mia Patel', [ATLAS]);
const omar = person('omar', 'Omar Haddad', [], { role: 'PM', title: null, department: null });

const member = (p: Person, isLead = false) => ({
  isLead,
  person: { id: p.id, name: p.name, email: p.email },
});
const teams: Team[] = [
  { id: 't2', name: 'Platform', description: null, members: [member(liam, true), member(mia)] },
  { id: 't1', name: 'Data', description: null, members: [member(liam)] },
];

const data: TeamsReportData = {
  teams,
  people: [omar, mia, liam],
  projects: [ORION, NOVA, ATLAS],
};

describe('teams report', () => {
  it('lists each team, member and project, with a No team group', () => {
    expect(byTeamRows(data).map((r) => [r[0], r[1], r[2], r[7]])).toEqual([
      ['Data', 'Liam Chen', '', 'ATLAS'],
      ['Data', 'Liam Chen', '', 'NOVA'],
      ['Platform', 'Liam Chen', 'Yes', 'ATLAS'],
      ['Platform', 'Liam Chen', 'Yes', 'NOVA'],
      ['Platform', 'Mia Patel', '', 'ATLAS'],
      ['No team', 'Omar Haddad', '', '—'],
    ]);
  });

  it('lists each project’s members with their teams, plus empty projects and unstaffed people', () => {
    expect(byProjectRows(data).map((r) => [r[0], r[2], r[3]])).toEqual([
      ['ATLAS', 'Liam Chen', 'Data, Platform (Lead)'],
      ['ATLAS', 'Mia Patel', 'Platform'],
      ['NOVA', 'Liam Chen', 'Data, Platform (Lead)'],
      ['ORION', 'No members', ''],
      ['—', 'Omar Haddad', 'No team'],
    ]);
  });

  it('writes the By team table as CSV, quoting where needed', () => {
    const lines = teamsReportCsv(data).trim().split('\r\n');
    expect(lines[0]).toBe('Team,Member,Team lead,Role,Title,Department,Email,Project key,Project');
    expect(lines).toContain(
      'Data,Liam Chen,,Team member,Engineer,Engineering,liam@example.test,NOVA,"Nova, ""next"""',
    );
    expect(lines).toHaveLength(7);
  });

  it('builds an Excel workbook with By team and By project sheets', async () => {
    const zip = await JSZip.loadAsync(await buildXlsx(teamsReportSheets(data)));
    const workbook = await zip.file('xl/workbook.xml')!.async('string');
    expect(workbook).toContain('name="By team"');
    expect(workbook).toContain('name="By project"');
    expect(await zip.file('xl/worksheets/sheet2.xml')!.async('string')).toContain('No members');
  });

  it('builds a deck: title, projects and all team members', async () => {
    const pptx = await buildTeamsPptx(data);
    // Title + projects + all team members; no per-team slides.
    expect((pptx as unknown as { slides: unknown[] }).slides.length).toBe(3);
  });

  it('pages long tables by whole rows', () => {
    expect(pageRows([1, 2, 1])).toEqual([[0, 1, 2]]);
    // Seven-line rows: three fit on a slide, the fourth starts the next one intact.
    expect(pageRows([7, 7, 7, 7])).toEqual([[0, 1, 2], [3]]);
  });

  it('puts the logo on a white title slide', async () => {
    // A 1x1 PNG stands in for the rendered SedHub mark.
    const logo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const pptx = await buildTeamsPptx(data, { logo });
    const zip = await JSZip.loadAsync(
      (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer,
    );
    const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide1).toContain('<p:pic>');
    expect(slide1).toContain('FFFFFF');
    expect(slide1).not.toContain('EEF1EE');
  });
});
