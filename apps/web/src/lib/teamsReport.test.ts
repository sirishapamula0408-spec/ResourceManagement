import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { Person, Team } from './api';
import { buildXlsx } from './reportXlsx';
import {
  buildTeamsPptx,
  byProjectRows,
  byTeamRows,
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

  it('builds a deck: title, projects summary and one slide per team', async () => {
    const pptx = await buildTeamsPptx(data);
    // Title + projects + Data + Platform + No team.
    expect((pptx as unknown as { slides: unknown[] }).slides.length).toBeGreaterThanOrEqual(5);
  });
});
