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

| Role   | Email                                                                               | Password       |
| ------ | ----------------------------------------------------------------------------------- | -------------- |
| ADMIN  | `admin@resourceboard.local`                                                         | `Admin@12345`  |
| PM     | `priya.sharma@resourceboard.local`                                                  | `Password@123` |
| PM     | `daniel.okafor@resourceboard.local`                                                 | `Password@123` |
| MEMBER | e.g. `liam.chen@resourceboard.local` (all others: `first.last@resourceboard.local`) | `Password@123` |

Sample data: 5 departments, 11 people, 4 teams, 3 projects (ATLAS, NOVA active; ORION planned),
8 weeks of allocations (2 past + current + 5 future, relative to the day you seed), 17 tasks across
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

| Method | Path                                     | Auth      | Notes                                      |
| ------ | ---------------------------------------- | --------- | ------------------------------------------ |
| GET    | `/api/health`                            | -         | liveness                                   |
| POST   | `/api/auth/login`                        | -         | `{ email, password }` -> `{ token, user }` |
| GET    | `/api/auth/me`                           | Bearer    |                                            |
| GET    | `/api/dashboard/summary`                 | -         | simple KPI counts for the current week     |
| GET    | `/api/people`, `/api/people/departments` | -         |                                            |
| GET    | `/api/teams`                             | -         |                                            |
| GET    | `/api/projects`                          | -         |                                            |
| POST   | `/api/projects`                          | ADMIN, PM | role-guard example                         |
| GET    | `/api/tasks?projectId&assigneeId&status` | -         |                                            |
| PATCH  | `/api/tasks/:id/move`                    | Bearer    | `{ status, order }` - used by the board    |

Read endpoints are intentionally open in the skeleton; add `requireAuth` once sign-in is enforced in the UI.

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
