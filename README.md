# Resource Board

Internal resource management app for project managers: utilization dashboard, JIRA-style task board,
team/project management, and (later) sprints, worklogs, leave, alerts, exports, JIRA sync and Azure AD SSO.

This repository is a **runnable skeleton**: the stack is wired end-to-end (DB -> API -> web) with
placeholder pages and a few real endpoints. Feature work starts from here.

## Stack

| Layer    | Tech                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------- |
| Monorepo | npm workspaces (`apps/api`, `apps/web`)                                                              |
| API      | Node 24, TypeScript, Express 5, Prisma 7 (PostgreSQL, `@prisma/adapter-pg`), zod 4, JWT + bcrypt     |
| Web      | Vite 8, React 19, TypeScript, React Router 7, TanStack Query 5, Tailwind CSS 4, @dnd-kit, Recharts 3 |
| Tests    | Vitest 5 + supertest                                                                                 |
| Tooling  | ESLint 10 (flat config, typescript-eslint), Prettier, EditorConfig, GitHub Actions                   |
| Local DB | `embedded-postgres` (PostgreSQL 17, no Docker/admin needed) or `docker-compose.yml`                  |

## Prerequisites

- **Node.js 24** (see `.nvmrc`; >= 22.12 works) and npm 11
- Git
- Nothing else. PostgreSQL binaries are installed by npm (`embedded-postgres`). Docker is optional.

## Getting started

```bash
npm install            # installs all workspaces + generates the Prisma client
cp .env.example .env   # only if .env does not exist yet; set a real JWT_SECRET
npm run db:start       # starts local Postgres on port 5433 in the background (data in .data/pg)
npm run db:migrate     # applies Prisma migrations (prisma migrate dev)
npm run db:seed        # loads sample data (wipes existing rows!)
npm run dev            # API on http://localhost:4100, web on http://localhost:5173
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the API (`PORT` from `.env`).
If 5173 is taken, Vite picks the next free port and prints it.

Stopping things:

- `Ctrl+C` in the `npm run dev` terminal stops the API and web server.
- `npm run db:stop` stops Postgres (it keeps running in the background otherwise). `npm run db:status` shows its state.

### Using Docker instead of embedded Postgres

```bash
docker compose up -d   # same port (5433) and credentials, so .env is unchanged
```

Don't run both at once.

### Seeded logins

| Role             | Email                                                                               | Password       |
| ---------------- | ----------------------------------------------------------------------------------- | -------------- |
| ADMIN            | `admin@resourceboard.local`                                                         | `Admin@12345`  |
| PM               | `priya.sharma@resourceboard.local`                                                  | `Password@123` |
| PM               | `daniel.okafor@resourceboard.local`                                                 | `Password@123` |
| DELIVERY_HEAD    | `kavya.rao@resourceboard.local` (fresh seeds only)                                  | `Password@123` |
| RESOURCE_MANAGER | `omar.haddad@resourceboard.local` (fresh seeds only)                                | `Password@123` |
| SALES            | `rohan.gupta@` / `ananya.iyer@resourceboard.local`                                  | `Sales@12345`  |
| MEMBER           | e.g. `liam.chen@resourceboard.local` (all others: `first.last@resourceboard.local`) | `Password@123` |

Sample data: 5 departments, 13 people, 4 teams, 3 projects (ATLAS, NOVA active; ORION planned),
8 weeks of allocations (2 past + current + 5 future, relative to the day you seed), 24 tasks across
all statuses, epics, sprints, worklogs, leave and alert thresholds. Development credentials only.

## Scripts (root)

| Script                         | What it does                                                                |
| ------------------------------ | --------------------------------------------------------------------------- |
| `npm run dev`                  | API (tsx watch) + web (Vite) concurrently                                   |
| `npm run build`                | `tsc` build of API to `apps/api/dist`, Vite build of web to `apps/web/dist` |
| `npm run lint` / `format`      | ESLint / Prettier                                                           |
| `npm run typecheck`            | `tsc` in all workspaces                                                     |
| `npm test`                     | Vitest in all workspaces                                                    |
| `npm run db:start/stop/status` | Local embedded Postgres                                                     |
| `npm run db:migrate`           | `prisma migrate dev` (create/apply migrations in dev)                       |
| `npm run db:deploy`            | `prisma migrate deploy` (CI / servers)                                      |
| `npm run db:seed`              | Seed sample data                                                            |
| `npm run db:studio`            | Prisma Studio                                                               |

Changing the schema: edit `apps/api/prisma/schema.prisma`, then `npm run db:migrate -- --name <change>`.
Prisma 7 does not regenerate the client automatically in every case; run `npm run db:generate -w @rb/api` if types look stale.

## Project structure

```
.
|-- apps/
|   |-- api/                      Express + Prisma REST API
|   |   |-- prisma/
|   |   |   |-- schema.prisma     data model (M1 + forward-compatible M2/M3 fields)
|   |   |   |-- migrations/
|   |   |   `-- seed.ts
|   |   |-- prisma.config.ts      Prisma 7 config (datasource URL, seed command)
|   |   |-- src/
|   |   |   |-- app.ts            express app (routes, middleware) - imported by tests
|   |   |   |-- server.ts         entry point
|   |   |   |-- config.ts         env validation (zod)
|   |   |   |-- lib/              prisma client, http helpers (HttpError, parse, error handler)
|   |   |   |-- middleware/auth.ts  requireAuth (JWT) + requireRole('ADMIN' | 'PM' | 'MEMBER')
|   |   |   |-- modules/{auth,people,teams,projects,tasks,dashboard}/  *.router.ts + *.service.ts
|   |   |   `-- generated/prisma/ generated client (gitignored, created on npm install)
|   |   `-- test/                 vitest + supertest
|   `-- web/                      Vite + React SPA
|       `-- src/
|           |-- pages/            Dashboard, Board, Tasks, Teams, Projects, Login
|           |-- components/       Layout, PageHeader
|           |-- lib/api.ts        fetch wrapper (adds JWT) + shared types
|           `-- router.tsx
|-- scripts/db-start.mjs          embedded Postgres start/stop/status
|-- docker-compose.yml            optional Postgres via Docker
|-- .github/workflows/ci.yml      lint, format, typecheck, migrate, seed, test, build
|-- eslint.config.js, .prettierrc.json, .editorconfig, tsconfig.base.json
`-- .env.example
```

## API (current)

| Method | Path                                     | Auth                  | Notes                                       |
| ------ | ---------------------------------------- | --------------------- | ------------------------------------------- |
| GET    | `/api/health`                            | -                     | liveness                                    |
| POST   | `/api/auth/login`                        | -                     | `{ email, password }` -> `{ token, user }`  |
| GET    | `/api/auth/me`                           | Bearer                |                                             |
| GET    | `/api/dashboard/overview`                | -                     | all four widgets below in one call          |
| GET    | `/api/dashboard/kpis`                    | -                     | six KPI tiles (+ unscheduled task count)    |
| GET    | `/api/dashboard/demand-vs-availability`  | -                     | team demand % vs availability per week      |
| GET    | `/api/dashboard/departments`             | -                     | scheduled hours + avg FTE by department     |
| GET    | `/api/dashboard/heatmap`                 | -                     | person x week utilization with bands        |
| GET    | `/api/reports/status?period=week         | month&date&projectId` | Bearer                                      | weekly/monthly project status report |
| GET    | `/api/people`, `/api/people/departments` | -                     |                                             |
| GET    | `/api/teams`                             | -                     |                                             |
| GET    | `/api/projects`                          | -                     |                                             |
| POST   | `/api/projects`                          | ADMIN, PM             | create (key, name, client, billable, ...)   |
| PATCH  | `/api/projects/:id`                      | ADMIN, PM             | edit                                        |
| DELETE | `/api/projects/:id`                      | ADMIN, PM             | only when it has no tasks (else 409)        |
| PUT    | `/api/projects/:id/members`              | ADMIN, PM             | `{ personIds }` - replace team members      |
| POST   | `/api/people`                            | ADMIN, PM             | add person; department by name              |
| PATCH  | `/api/people/:id`                        | ADMIN, PM             | edit; only ADMIN changes roles              |
| DELETE | `/api/people/:id`                        | ADMIN, PM             | deactivate + unassign their open tasks      |
| PUT    | `/api/people/:id/projects`               | ADMIN, PM             | `{ projectIds }` - replace projects         |
| GET    | `/api/tasks?projectId&assigneeId&status` | -                     |                                             |
| POST   | `/api/tasks`                             | ADMIN, PM             | create; PMs only on projects they own/staff |
| PATCH  | `/api/tasks/:id`                         | Bearer                | edit; assignees may change status only      |
| DELETE | `/api/tasks/:id`                         | ADMIN, PM             | PMs only on their projects                  |
| PATCH  | `/api/tasks/:id/move`                    | Bearer                | `{ status, order }` - board; assignee or PM |
| POST   | `/api/tasks/:id/worklogs`                | Bearer                | `{ hours, date?, note? }` as signed-in user |

Dashboard endpoints take `?from=YYYY-MM-DD&weeks=8&projectId=` (default window: two weeks before the
current week, eight weeks long). Utilization follows the scope plan: each non-backlog task's estimate is
spread evenly over the working days from its start to due date; under-utilized is >0% and <70% this week,
over-utilized >100%, on bench exactly 0%. Rules live in `apps/api/src/modules/dashboard/utilization.ts`.

Every endpoint except `/api/health` and `/api/auth/login` requires a signed-in, active user. The
token only proves identity: role and active status are read on each request, so role changes and
removals apply immediately. Passwords set by someone else (new person, reset) must be changed at the
next sign-in (`POST /api/auth/password`); until then other endpoints return 403
`PASSWORD_CHANGE_REQUIRED`.

### Roles (scope plan: Users and roles)

A team member only sees their own projects, the tasks on those projects (their board), the tasks
assigned to them on the Tasks page, and only their own figures on the Dashboard and Team pages. The
API enforces this on every read (`apps/api/src/lib/visibility.ts`).

| Role             | People, projects, staffing                  | Tasks                                          | Roles / admins |
| ---------------- | ------------------------------------------- | ---------------------------------------------- | -------------- |
| ADMIN            | edit                                        | edit all                                       | yes            |
| DELIVERY_HEAD    | edit                                        | view                                           | -              |
| RESOURCE_MANAGER | edit                                        | view                                           | -              |
| PM               | view                                        | create/edit/move on projects they own or staff | -              |
| MEMBER           | view own projects only                      | status + hours on tasks assigned to them       | -              |
| SALES            | project list only (no team, tasks or hours) | none; works the Leads pipeline (all leads)     | -              |

## Reports

The Reports tab generates weekly (Monday to Sunday) or monthly project status reports from live data:
health (On track / At risk / Off track, with the reasons), tasks completed, hours logged and planned in
the period, open, overdue and blocked tasks, what is due next period, and hours per person. It prints
cleanly (Print / Save as PDF, one project per page), exports a CSV with one row per project, and downloads a
PowerPoint deck (title, portfolio summary, one slide per project, health rules) built in the browser.

- **Off track:** a blocked critical task, 3+ overdue tasks, or hours logged above the total estimate.
- **At risk:** any blocked or overdue task, or hours logged at 90%+ of the estimate.
- **Demo data for checking reports:** `npm run db:demo:reports` adds three projects (`DEMO-GRN` on track,
  `DEMO-AMB` at risk, `DEMO-RED` off track) with about 12 weeks of completed tasks and logged hours, relative to
  today. It only adds data; `npm run db:demo:reports -- --remove` deletes the three projects again.
- Completed dates come from `Task.completedAt`, set when a task moves to Done (tasks already done before
  this field existed were backfilled with their last update time). Team members only get their own projects.

## Leads (sales pipeline)

Sales users sign in to a **Leads** page: company and contact, source, stage (New → Contacted → Qualified →
Proposal → Negotiation → Won / Lost), **priority** (High / Medium / Low), estimated value in INR, expected
close, next follow-up, owner and notes, with a summary (open pipeline, high priority, follow-ups due, won
this month), stage chips, filters, sorting and paging. Every sales user can see and edit every lead; admins
have full access; delivery heads and PMs can read the pipeline. Sales users also get a read-only project
list and nothing else (`salesAreaGuard` in the API).

`npm run db:demo:sales` adds the two sample sales users and 45 leads (every stage, priority and source;
follow-ups due today, overdue, upcoming and none; won this month and last month; unassigned leads; missing
values and contact details) to an existing database
(`-- --remove` deletes them); the main seed includes them.

## Claude connector (MCP)

Everyone can use Resource Board from Claude (web, desktop, mobile, Claude Code) with their own account.
The API serves an MCP endpoint at `/mcp` with OAuth sign-in through the normal login and a consent page
(`/connect`); every tool calls the REST API as that person, so roles and visibility are unchanged. Code:
`apps/api/src/modules/mcp/`. It's on when `PUBLIC_URL` is set (defaults to `http://localhost:5173`
outside production). How-to articles: [`docs/how-to/`](docs/how-to/README.md).

## Testing

| Command       | What it does                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`    | API and web unit tests (Vitest)                                                                                                                                              |
| `npm run e2e` | Builds the app and runs the browser tests in `e2e/` (Playwright) against a fresh `resource_board_e2e` database. Uses your installed Microsoft Edge locally; CI uses Chromium |

## UAT environment

A separate `resource_board_uat` database on the same local Postgres, so resetting it never touches your development data.

1. `npm run uat:reset` – recreates the UAT database with the sample data and gives the UAT accounts fresh temporary
   passwords (written to `.data/uat-credentials.txt`, gitignored; share them with the testers directly). Everyone else
   in the UAT data has no password.
2. `npm run uat:start` – builds the app and serves it on your network at `http://<your IP>:4173` (API on 4200). Allow
   Node.js through Windows Firewall on private networks when asked.

Testers record results on the shared UAT tracker page (link in the build board).

## Server deployment (Docker)

`deploy/` holds images for the API and the web app (nginx serving the build and proxying `/api`) and a compose file for
running everything on one machine:

```
JWT_SECRET=<long random value> docker compose -f deploy/docker-compose.server.yml up -d --build
docker compose -f deploy/docker-compose.server.yml run --rm -e NODE_ENV=development api npm run db:seed -w @rb/api
```

Then open `http://<server>:8080`. CI builds these images and smoke-tests the stack on every push.

## Milestone map

| Milestone              | Scope                                                                                         | Where it lands                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** Discovery/setup | repo, CI, environments                                                                        | this skeleton; `ci.yml`; deployment target (cloud vs on-prem) still open - app is a plain Node API + static SPA + Postgres, so it fits either |
| **M1** MVP             | Postgres schema + REST API                                                                    | `apps/api/prisma/schema.prisma`, `src/modules/*`                                                                                              |
|                        | Dashboard & KPIs (six KPIs, demand vs availability, department donut, person x week heat map) | `modules/dashboard`, `pages/DashboardPage.tsx` (Recharts)                                                                                     |
|                        | Task board + list (drag-and-drop)                                                             | `modules/tasks`, `pages/BoardPage.tsx` (@dnd-kit), `pages/TasksPage.tsx`                                                                      |
|                        | Team & project management                                                                     | `modules/teams`, `modules/projects`, `modules/people`                                                                                         |
|                        | Roles & sign-in                                                                               | `modules/auth`, `middleware/auth.ts`, `pages/LoginPage.tsx`                                                                                   |
| **M2**                 | Sprints & epics, worklogs, leave reducing capacity, alert thresholds, Excel/CSV export        | models `Sprint`, `Epic`, `Worklog`, `Leave`, `AlertThreshold` already exist; add modules + pages                                              |
| **M3**                 | JIRA two-way sync, Azure AD SSO, audit log                                                    | `jiraKey`/`jiraAccountId`/`externalId` columns and `AuditLog` model already exist                                                             |

## Troubleshooting

- **Port in use**: change `PORT` in `.env` (API) - the Vite proxy follows it. For Postgres change the port in `DATABASE_URL` and re-run `npm run db:start`.
- **Postgres won't start**: check `.data/pg.log`. To start fresh: `npm run db:stop`, delete `.data/`, then `db:start`, `db:migrate`, `db:seed`.
- **Prisma types missing**: `npm run db:generate -w @rb/api`.
