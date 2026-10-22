/**
 * Seed realistic sample data. Idempotent: wipes existing rows first (dev only!).
 * Run with `npm run db:seed`.
 *
 * Logins (documented in README):
 *   admin@resourceboard.local / Admin@12345   (ADMIN)
 *   priya.sharma@resourceboard.local / Password@123 (PM) - all other users share this password
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { weekStartOf } from '../src/modules/dashboard/dashboard.service.js';
import type { Person } from '../src/generated/prisma/client.js';
import type { Role, TaskPriority, TaskStatus } from '../src/generated/prisma/enums.js';

const ADMIN_PASSWORD = 'Admin@12345';
const USER_PASSWORD = 'Password@123';
const DOMAIN = 'resourceboard.local';

const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');

  console.log('Clearing existing data ...');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.alertThreshold.deleteMany(),
    prisma.worklog.deleteMany(),
    prisma.task.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.epic.deleteMany(),
    prisma.allocation.deleteMany(),
    prisma.leave.deleteMany(),
    prisma.teamMember.deleteMany(),
    prisma.team.deleteMany(),
    prisma.project.deleteMany(),
    prisma.person.deleteMany(),
    prisma.department.deleteMany(),
  ]);

  const [adminHash, userHash] = await Promise.all([
    bcrypt.hash(ADMIN_PASSWORD, 10),
    bcrypt.hash(USER_PASSWORD, 10),
  ]);

  // ---------- Departments ----------
  const deptNames = ['Engineering', 'Design', 'Quality Assurance', 'Data & Analytics', 'PMO'];
  const depts = Object.fromEntries(
    await Promise.all(
      deptNames.map(async (name) => [name, await prisma.department.create({ data: { name } })]),
    ),
  );

  // ---------- People ----------
  const peopleData: Array<{
    name: string;
    title: string;
    dept: string;
    role: Role;
    capacity?: number;
    email?: string;
  }> = [
    {
      name: 'Admin User',
      title: 'System Administrator',
      dept: 'PMO',
      role: 'ADMIN',
      email: `admin@${DOMAIN}`,
    },
    { name: 'Priya Sharma', title: 'Senior Project Manager', dept: 'PMO', role: 'PM' },
    { name: 'Daniel Okafor', title: 'Project Manager', dept: 'PMO', role: 'PM' },
    { name: 'Arjun Mehta', title: 'Tech Lead', dept: 'Engineering', role: 'MEMBER' },
    { name: 'Sofia Rossi', title: 'Senior Backend Engineer', dept: 'Engineering', role: 'MEMBER' },
    { name: 'Liam Chen', title: 'Frontend Engineer', dept: 'Engineering', role: 'MEMBER' },
    {
      name: 'Fatima Al-Sayed',
      title: 'Full-stack Engineer',
      dept: 'Engineering',
      role: 'MEMBER',
      capacity: 32,
    },
    { name: 'Noah Williams', title: 'UX Designer', dept: 'Design', role: 'MEMBER' },
    { name: 'Meera Iyer', title: 'QA Engineer', dept: 'Quality Assurance', role: 'MEMBER' },
    { name: 'Lucas Martin', title: 'Data Engineer', dept: 'Data & Analytics', role: 'MEMBER' },
    {
      name: 'Emma Johansson',
      title: 'Data Analyst',
      dept: 'Data & Analytics',
      role: 'MEMBER',
      capacity: 24,
    },
  ];

  const people: Person[] = [];
  for (const p of peopleData) {
    const email = p.email ?? `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}@${DOMAIN}`;
    people.push(
      await prisma.person.create({
        data: {
          name: p.name,
          email,
          title: p.title,
          role: p.role,
          departmentId: depts[p.dept].id,
          weeklyCapacityHours: p.capacity ?? 40,
          passwordHash: p.role === 'ADMIN' ? adminHash : userHash,
        },
      }),
    );
  }
  const byName = (name: string) => people.find((p) => p.name === name)!;
  const [, priya, daniel, arjun, sofia, liam, fatima, noah, meera, lucas, emma] = people;

  // ---------- Teams ----------
  const teams = [
    {
      name: 'Platform',
      description: 'Core platform & APIs',
      members: [arjun, sofia, fatima],
      lead: arjun,
    },
    {
      name: 'Experience',
      description: 'Web UI & design',
      members: [liam, noah, fatima],
      lead: liam,
    },
    {
      name: 'Insights',
      description: 'Data pipelines & reporting',
      members: [lucas, emma],
      lead: lucas,
    },
    { name: 'Quality', description: 'Testing & release', members: [meera], lead: meera },
  ];
  for (const t of teams) {
    await prisma.team.create({
      data: {
        name: t.name,
        description: t.description,
        members: { create: t.members.map((m) => ({ personId: m.id, isLead: m.id === t.lead.id })) },
      },
    });
  }

  // ---------- Projects ----------
  const thisWeek = weekStartOf(new Date());
  const firstWeek = addDays(thisWeek, -14); // 2 weeks back, 6 weeks forward = 8 weeks
  const projects = await Promise.all([
    prisma.project.create({
      data: {
        code: 'ATLAS',
        name: 'Atlas Customer Portal',
        description: 'Self-service portal for enterprise customers.',
        status: 'ACTIVE',
        startDate: addDays(firstWeek, -28),
        endDate: addDays(firstWeek, 84),
        ownerId: priya.id,
      },
    }),
    prisma.project.create({
      data: {
        code: 'NOVA',
        name: 'Nova Data Platform',
        description: 'Unified analytics warehouse and dashboards.',
        status: 'ACTIVE',
        startDate: addDays(firstWeek, -7),
        endDate: addDays(firstWeek, 112),
        ownerId: daniel.id,
      },
    }),
    prisma.project.create({
      data: {
        code: 'ORION',
        name: 'Orion Mobile Refresh',
        description: 'Redesign of the field-sales mobile app.',
        status: 'PLANNED',
        startDate: addDays(firstWeek, 28),
        endDate: addDays(firstWeek, 140),
        ownerId: priya.id,
      },
    }),
  ]);
  const [atlas, nova, orion] = projects;

  // ---------- Allocations (8 weeks) ----------
  // [person, project, hours per week, first week index (0-7)]
  const plan: Array<[typeof arjun, typeof atlas, number, number]> = [
    [arjun, atlas, 24, 0],
    [arjun, nova, 12, 0],
    [sofia, atlas, 40, 0],
    [sofia, orion, 8, 4], // over-allocated from week 4
    [liam, atlas, 32, 0],
    [liam, orion, 8, 4],
    [fatima, atlas, 16, 0],
    [fatima, nova, 16, 0],
    [noah, atlas, 12, 0],
    [noah, orion, 24, 4],
    [meera, atlas, 20, 0],
    [meera, nova, 10, 2],
    [lucas, nova, 36, 0],
    [emma, nova, 16, 0],
    [priya, atlas, 10, 0],
    [priya, orion, 6, 4],
    [daniel, nova, 12, 0],
  ];
  const allocations = [];
  for (let w = 0; w < 8; w++) {
    const weekStart = addDays(firstWeek, w * 7);
    for (const [person, project, hours, fromWeek] of plan) {
      if (w < fromWeek) continue;
      // small deterministic variation so the heat map is interesting
      const jitter = ((w + person.name.length) % 3) * 2 - 2;
      allocations.push({
        personId: person.id,
        projectId: project.id,
        weekStart,
        hours: Math.max(hours + jitter, 0),
      });
    }
  }
  await prisma.allocation.createMany({ data: allocations });

  // ---------- Epics & sprints ----------
  const atlasEpic = await prisma.epic.create({
    data: { projectId: atlas.id, name: 'Account self-service', color: '#6366f1' },
  });
  const novaEpic = await prisma.epic.create({
    data: { projectId: nova.id, name: 'Ingestion pipelines', color: '#10b981' },
  });
  const atlasSprint = await prisma.sprint.create({
    data: {
      projectId: atlas.id,
      name: 'ATLAS Sprint 7',
      status: 'ACTIVE',
      startDate: thisWeek,
      endDate: addDays(thisWeek, 13),
      goal: 'Ship invoice download',
    },
  });
  const novaSprint = await prisma.sprint.create({
    data: {
      projectId: nova.id,
      name: 'NOVA Sprint 2',
      status: 'ACTIVE',
      startDate: thisWeek,
      endDate: addDays(thisWeek, 13),
    },
  });

  // ---------- Tasks ----------
  const taskData: Array<
    [typeof atlas, string, TaskStatus, TaskPriority, typeof arjun | null, number]
  > = [
    [atlas, 'Design login & password reset flow', 'DONE', 'HIGH', noah, 8],
    [atlas, 'Implement JWT session refresh', 'DONE', 'HIGH', sofia, 6],
    [atlas, 'Invoice list API with pagination', 'IN_REVIEW', 'MEDIUM', sofia, 10],
    [atlas, 'Invoice PDF download', 'IN_PROGRESS', 'HIGH', liam, 12],
    [atlas, 'Account settings page', 'IN_PROGRESS', 'MEDIUM', fatima, 8],
    [atlas, 'SSO with customer IdPs (spike)', 'BLOCKED', 'MEDIUM', arjun, 5],
    [atlas, 'E2E tests for billing area', 'TODO', 'MEDIUM', meera, 10],
    [atlas, 'Accessibility audit', 'TODO', 'LOW', noah, 6],
    [nova, 'Set up warehouse schemas', 'DONE', 'CRITICAL', lucas, 16],
    [nova, 'CRM ingestion job', 'IN_PROGRESS', 'HIGH', lucas, 20],
    [nova, 'Sales KPI dashboard prototype', 'IN_PROGRESS', 'MEDIUM', emma, 12],
    [nova, 'Data quality checks', 'TODO', 'HIGH', meera, 8],
    [nova, 'Row-level security model', 'IN_REVIEW', 'HIGH', fatima, 10],
    [nova, 'Finance data source access', 'BLOCKED', 'CRITICAL', daniel, 2],
    [orion, 'Mobile UX research interviews', 'TODO', 'MEDIUM', noah, 16],
    [orion, 'Tech stack evaluation', 'TODO', 'LOW', arjun, 8],
    [orion, 'Project kickoff deck', 'TODO', 'LOW', null, 3],
  ];
  const orderCounter = new Map<string, number>();
  const tasks = [];
  for (const [project, title, status, priority, assignee, estimate] of taskData) {
    const key = `${project.id}:${status}`;
    const order = (orderCounter.get(key) ?? 0) + 1000;
    orderCounter.set(key, order);
    tasks.push(
      await prisma.task.create({
        data: {
          projectId: project.id,
          title,
          status,
          priority,
          assigneeId: assignee?.id,
          estimateHours: estimate,
          order,
          epicId: project === atlas ? atlasEpic.id : project === nova ? novaEpic.id : null,
          sprintId: project === atlas ? atlasSprint.id : project === nova ? novaSprint.id : null,
        },
      }),
    );
  }

  // ---------- Worklogs, leave, thresholds, audit ----------
  const worklogs = tasks
    .filter((t) => t.assigneeId && t.status !== 'TODO')
    .flatMap((t, i) => [
      { taskId: t.id, personId: t.assigneeId!, date: addDays(thisWeek, -7 + (i % 5)), hours: 3 },
      { taskId: t.id, personId: t.assigneeId!, date: addDays(thisWeek, i % 3), hours: 2.5 },
    ]);
  await prisma.worklog.createMany({ data: worklogs });

  await prisma.leave.createMany({
    data: [
      {
        personId: liam.id,
        startDate: addDays(thisWeek, 14),
        endDate: addDays(thisWeek, 18),
        type: 'VACATION',
        note: 'Family trip',
      },
      {
        personId: meera.id,
        startDate: addDays(thisWeek, 2),
        endDate: addDays(thisWeek, 2),
        type: 'SICK',
      },
      {
        personId: byName('Sofia Rossi').id,
        startDate: addDays(thisWeek, 28),
        endDate: addDays(thisWeek, 29),
        type: 'TRAINING',
        note: 'Cloud certification',
      },
    ],
  });

  await prisma.alertThreshold.createMany({
    data: [
      { metric: 'OVER_ALLOCATION', value: 100 },
      { metric: 'UNDER_UTILIZATION', value: 60 },
      { metric: 'TASK_OVERDUE', value: 0 },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: people[0].id,
      action: 'seed.run',
      entityType: 'System',
      after: { people: people.length, projects: projects.length },
    },
  });

  console.log(
    `Seeded ${deptNames.length} departments, ${people.length} people, ${teams.length} teams, ` +
      `${projects.length} projects, ${allocations.length} allocations, ${tasks.length} tasks, ${worklogs.length} worklogs.`,
  );
  console.log(`Admin login: admin@${DOMAIN} / ${ADMIN_PASSWORD}`);
  console.log(`Other users: <first>.<last>@${DOMAIN} / ${USER_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
