# How to use the Resource Board REST API

**For:** anyone who wants to script Resource Board, pull data into a spreadsheet or another tool, or
let Claude Code call it. For chatting with Claude, the [Claude connector](connect-claude.md) is easier.

The web app itself runs on this API, so everything you can do in the browser you can do here, with
exactly the same access: you sign in as yourself and your role decides what you can see and change.

In the examples, replace `https://board.example.com` with your Resource Board address. On a developer
machine running `npm run dev`, use `http://localhost:5173`.

## 1. Sign in and get a token

Send your email and password to `POST /api/auth/login`. The response has a `token` that is valid for
**8 hours**.

**macOS / Linux / Git Bash**

```sh
export RB_URL="https://board.example.com"
export RB_TOKEN=$(curl -s "$RB_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}' | jq -r .token)
```

**Windows PowerShell**

```powershell
$RB_URL = "https://board.example.com"
$login = Invoke-RestMethod -Method Post -Uri "$RB_URL/api/auth/login" -ContentType "application/json" `
  -Body (@{ email = "you@example.com"; password = Read-Host "Password" } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }
```

Keep the token secret: it acts as you until it expires. Don't put your password or token in scripts
you commit; read them from environment variables or a prompt.

## 2. Call the API

Send the token in the `Authorization` header on every request.

```sh
curl -s "$RB_URL/api/auth/me" -H "Authorization: Bearer $RB_TOKEN"
curl -s "$RB_URL/api/tasks?status=IN_PROGRESS" -H "Authorization: Bearer $RB_TOKEN"
```

```powershell
Invoke-RestMethod -Uri "$RB_URL/api/tasks?status=IN_PROGRESS" -Headers $headers
```

Log 2.5 hours on a task:

```sh
curl -s -X POST "$RB_URL/api/tasks/<taskId>/worklogs" \
  -H "Authorization: Bearer $RB_TOKEN" -H "Content-Type: application/json" \
  -d '{"hours":2.5,"date":"2026-10-29","note":"Code review"}'
```

```powershell
Invoke-RestMethod -Method Post -Uri "$RB_URL/api/tasks/<taskId>/worklogs" -Headers $headers `
  -ContentType "application/json" -Body (@{ hours = 2.5; note = "Code review" } | ConvertTo-Json)
```

Bodies are JSON, dates are `YYYY-MM-DD`, and ids come from the list endpoints.

## Endpoints

Every endpoint needs the token except `GET /api/health` and `POST /api/auth/login`.

| Method | Path                                     | Who                                    | Notes                                                                                                      |
| ------ | ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/auth/me`                           | everyone                               | your name, email and role                                                                                  |
| POST   | `/api/auth/password`                     | everyone                               | `{ currentPassword, newPassword }`                                                                         |
| GET    | `/api/projects`                          | everyone                               | members see their own projects; sales get basic facts only                                                 |
| POST   | `/api/projects`                          | admin, delivery head, resource manager | create                                                                                                     |
| PATCH  | `/api/projects/:id`                      | admin, delivery head, resource manager | edit                                                                                                       |
| DELETE | `/api/projects/:id`                      | admin, delivery head, resource manager | only when it has no tasks                                                                                  |
| PUT    | `/api/projects/:id/members`              | admin, delivery head, resource manager | `{ personIds }` replaces the team                                                                          |
| GET    | `/api/people`, `/api/people/departments` | everyone except sales                  |                                                                                                            |
| POST   | `/api/people`                            | admin, delivery head, resource manager | add a person                                                                                               |
| PATCH  | `/api/people/:id`                        | admin, delivery head, resource manager | only admins change roles                                                                                   |
| DELETE | `/api/people/:id`                        | admin, delivery head, resource manager | deactivates and unassigns their open tasks                                                                 |
| PUT    | `/api/people/:id/projects`               | admin, delivery head, resource manager | `{ projectIds }`                                                                                           |
| GET    | `/api/teams`                             | everyone except sales                  |                                                                                                            |
| GET    | `/api/tasks?projectId&assigneeId&status` | everyone except sales                  | members see tasks on their projects                                                                        |
| POST   | `/api/tasks`                             | admin; PMs on their projects           | `{ projectId, title, ... }`                                                                                |
| PATCH  | `/api/tasks/:id`                         | admin, project PM; assignee for status | send only the fields to change                                                                             |
| PATCH  | `/api/tasks/:id/move`                    | admin, project PM, assignee            | `{ status, order }` (board)                                                                                |
| POST   | `/api/tasks/:id/worklogs`                | admin, project PM, assignee            | `{ hours, date?, note? }`, logged as you                                                                   |
| DELETE | `/api/tasks/:id`                         | admin; PMs on their projects           |                                                                                                            |
| POST   | `/api/tasks/bulk-delete`                 | admin; PMs on their projects           | `{ ids }`, up to 500                                                                                       |
| GET    | `/api/dashboard/overview`                | everyone except sales                  | `?from=YYYY-MM-DD&weeks=8&projectId=`; also `/kpis`, `/demand-vs-availability`, `/departments`, `/heatmap` |
| GET    | `/api/reports/status`                    | everyone except sales                  | `?period=week\|month&date=YYYY-MM-DD&projectId=`                                                           |
| GET    | `/api/leads`, `/api/leads/owners`        | admin, sales, delivery head, PM        |                                                                                                            |
| POST   | `/api/leads`                             | admin, sales                           | `{ company, contactName, ... }`                                                                            |
| PATCH  | `/api/leads/:id`                         | admin, sales                           | send only the fields to change                                                                             |
| DELETE | `/api/leads/:id`                         | admin, sales                           |                                                                                                            |

Values for fixed lists:

- Task `status`: `BACKLOG`, `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, `DONE` (see `TaskStatus` in
  `apps/api/prisma/schema.prisma` for the current list, and `TaskPriority` / `TaskType`).
- Lead `stage`: `NEW`, `CONTACTED`, `QUALIFIED`, `PROPOSAL`, `NEGOTIATION`, `WON`, `LOST`;
  `priority`: `HIGH`, `MEDIUM`, `LOW`; `source`: `REFERRAL`, `WEBSITE`, `EVENT`, `OUTBOUND`,
  `PARTNER`, `OTHER`.

## Errors

Errors come back as `{ "error": "message", "details": ... }`.

| Status | Meaning                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------ |
| 400    | Invalid input. `details.fieldErrors` says which fields and why.                                        |
| 401    | Missing, expired or invalid token, or your account is inactive. Sign in again.                         |
| 403    | Your role can't do this. `details.code = "PASSWORD_CHANGE_REQUIRED"` means change your password first. |
| 404    | No such record (check the id).                                                                         |
| 409    | Conflicts with existing data, e.g. deleting a project that still has tasks.                            |

## Let Claude Code use the API

With `RB_URL` and `RB_TOKEN` set in your terminal (step 1), start Claude Code there and ask, for example:

> Using the Resource Board API at $RB_URL with the bearer token in $RB_TOKEN (see
> docs/how-to/use-the-rest-api.md), export all my open tasks to tasks.csv with project, title, status
> and due date.

Claude Code reads this page for the endpoints and calls them with `curl`. For anything you'll do
regularly, the [Claude connector](connect-claude.md) is simpler: no tokens to copy, and it signs you in
again automatically.
