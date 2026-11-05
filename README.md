# SedHub

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
| VIEWER           | `viewer@resourceboard.local` (Vera Viewer, on ATLAS; fresh seeds only)              | `Password@123` |

Sample data: 5 departments, 14 people, 4 teams, 3 projects (ATLAS, NOVA active; ORION planned),
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
| GET    | `/api/tasks/:id/attachments`             | Bearer                | `{ attachments, maxBytes }`, newest first   |
| POST   | `/api/tasks/:id/attachments?name=`       | Bearer                | raw file body; PM on project or assignee    |
| GET    | `/api/attachments/:id`                   | Bearer                | download (always `attachment`, nosniff)     |
| DELETE | `/api/attachments/:id`                   | Bearer                | uploader, admin or PM on the project        |
| GET    | `/api/notifications?unread=1`            | Bearer                | own, newest 50: `{ items, unreadCount }`    |
| GET    | `/api/notifications/count`               | Bearer                | `{ unreadCount }`                           |
| POST   | `/api/notifications/:id/read`            | Bearer                | own only; returns `{ unreadCount }`         |
| POST   | `/api/notifications/read-all`            | Bearer                | returns `{ unreadCount }`                   |
| GET    | `/api/sprints/:id/burndown`              | Bearer                | remaining vs ideal per day; needs dates     |

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

A team member only sees their own projects, the tasks on those projects (their board) and the tasks
assigned to them. The API enforces this on every read (`apps/api/src/lib/visibility.ts`). A viewer
sees the same projects and their tasks, read-only: the API refuses every write from a viewer with 403
(`viewerGuard` in `middleware/auth.ts`, and again in the task services), except their own password,
saved filters and notification read state. Viewers can't be assigned tasks.

Top-bar tabs: admins, delivery heads and PMs get Resource Dashboard, Projects, Team, Reports and Leads; resource
managers the same without Leads; sales users Leads and Projects; team members and viewers Projects only
(other pages redirect them to Projects, and viewers also get 403 from the dashboard, reports, teams and
leads API).

| Role             | People, projects, staffing                  | Tasks                                          | Roles / admins |
| ---------------- | ------------------------------------------- | ---------------------------------------------- | -------------- |
| ADMIN            | edit                                        | edit all                                       | yes            |
| DELIVERY_HEAD    | edit                                        | view                                           | -              |
| RESOURCE_MANAGER | edit                                        | view                                           | -              |
| PM               | view                                        | create/edit/move on projects they own or staff | -              |
| MEMBER           | view own projects only                      | status + hours on tasks assigned to them       | -              |
| SALES            | project list only (no team, tasks or hours) | none; works the Leads pipeline (all leads)     | -              |
| VIEWER           | view own projects only                      | view tasks on own projects; no changes         | -              |

## Task attachments

Files on a task (task page and task dialog: button or drag-and-drop). They are stored on the API's local
disk under `UPLOAD_DIR` (default `apps/api/uploads`, gitignored), each under a generated id; the original
name, type, size and uploader are kept in the `Attachment` table. `deploy/docker-compose.server.yml` mounts
the `uploads` volume there so files survive restarts and rebuilds (back it up with the database).

- Upload: `POST /api/tasks/:id/attachments?name=<file name>` with the file as the raw request body and its
  type as `Content-Type`. Up to `MAX_UPLOAD_MB` (default 10; nginx in `deploy/` allows 12 MB).
  Programs, scripts and web pages (`.exe`, `.bat`, `.sh`, `.js`, `.html`, `.svg`, ...) are refused (415).
- Downloads are always sent with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`
  and a sandboxing CSP, so nothing renders from our origin. The web app downloads with its bearer token
  (fetch, then a temporary object URL).
- Anyone who can see the task lists and downloads its files; an admin, a PM on the project or the
  assignee uploads; the uploader or an admin / PM on the project deletes. Adding and removing files
  shows in the task history. Deleting a task deletes its files.

## Notifications

The bell in the top bar shows unread notifications (refreshed every 30 seconds and when the window
regains focus); opening one marks it read and goes to its task. You get one when someone else:

- assigns a task to you (on create or edit),
- comments on a task you are assigned to or created (`Task.createdById`; tasks created before it existed
  were backfilled from their history),
- changes the status of a task assigned to you (edit or board move).

Never for your own actions. A team member only sees notifications about tasks they can still see. Sales
users have no bell (no task access). Notifications are kept; there is no automatic clean-up yet.

## Sprint burndown

The project's Sprints view shows a burndown for the active sprint (or the one picked with **Burndown** on
its row), in hours or tasks, and the Summary's Active sprint card a compact one.
`GET /api/sprints/:id/burndown` returns `{ sprint, days: [{ date, remainingHours, remainingTasks, idealHours,
idealTasks }], totalHours, totalTasks }` for every day from the start to the end date; days after today have
`null` remaining work. Remaining = current estimates (and count) of the tasks in the sprint and not Done at
the end of that day, rebuilt from the task history (status and sprint changes) where it exists and from
`completedAt` and current sprint membership where it doesn't (so days before history was recorded are an
approximation; see `apps/api/src/modules/planning/burndown.service.ts`). The ideal line runs from the
current scope to zero on the last day. Completing a sprint now records the tasks it sends back to the
backlog in their history, so a completed sprint's chart keeps them.

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

## Sign-up

Self-registration is **off by default** in every environment: admins add people on the Team page, and
the login page only says **Need access? Contact your administrator**. To turn it on, list the allowed
email domains in `SIGNUP_DOMAINS` (comma-separated, e.g. `example.com,example.in`); people with such an
address can then create an account at `/signup`. New accounts are team members with no projects,
signed in straight away; an admin changes their role and staffing. Emails are not verified, so only list domains whose addresses
you trust, and review new people on the Team page. `POST /api/auth/signup` allows 20 attempts an hour
per address.

## Sign-in security

- An unknown email and a wrong password get the same `401` (and take about as long: a bcrypt check runs
  either way). A disabled account is reported (`403`, `details.code: ACCOUNT_DISABLED`) only after the
  right password.
- 5 failed sign-ins for one email within 15 minutes lock it for 15 minutes: `423` with a `Retry-After`
  header and `details.retryAfterSeconds`. A successful sign-in clears the count. Each client address may
  also fail 20 times per 15 minutes (`429`). Both are kept in memory, which suits the single API
  instance; several instances would need a shared store.
- Sign-ins, failures and lockouts are written to the audit log (`auth.login`, `auth.login_failed`,
  `auth.locked`, with the client address).
- "Encrypted connection (TLS)" on the sign-in page relies on the deployment: the bundled nginx
  (`deploy/nginx.conf`) listens on plain HTTP, so put HTTPS in front of it (load balancer or reverse
  proxy), as the Claude connector also requires.

## Claude connector (MCP)

Everyone can use SedHub from Claude (web, desktop, mobile, Claude Code) with their own account.
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
