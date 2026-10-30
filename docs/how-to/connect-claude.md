# How to connect Claude to Resource Board

**For:** everyone with a Resource Board account. **Time:** about two minutes.

Once connected, you can ask Claude about your projects, tasks, hours, utilization, status reports and
sales leads, and ask it to make changes for you. Claude signs in **as you**: it sees and changes exactly
what you can in the app, nothing more. A team member's Claude sees only their own projects; a sales
user's Claude sees leads and the project list.

You need the Resource Board address from your admin, for example `https://board.example.com`. The
connector address is that plus `/mcp`, for example `https://board.example.com/mcp`.

## Claude on the web, desktop and mobile (claude.ai)

Connectors you add on claude.ai also appear in the Claude desktop and mobile apps.

### If your organization already added Resource Board

On Claude Team and Enterprise plans, an owner usually adds the connector once for everyone.

1. In Claude, open **Settings → Connectors**.
2. Find **Resource Board** and select **Connect**.
3. Continue with [Sign in and allow access](#sign-in-and-allow-access).

### If you add it yourself

1. In Claude, open **Settings → Connectors** and select **Add custom connector**.
2. Enter:
   - **Name:** `Resource Board`
   - **Remote MCP server URL:** `https://board.example.com/mcp` (your address + `/mcp`)
3. Leave the advanced OAuth settings empty and select **Add**.
4. Select **Connect** next to Resource Board.

If you don't see **Add custom connector**, your plan or your organization's settings don't allow it.
Ask your Claude owner to add Resource Board for the organization.

### Sign in and allow access

1. A Resource Board page opens. Sign in with your usual email and password (skip this if you're
   already signed in).
2. The page shows **Connect Claude** and the account it will use. Check that it's you; if not, select
   **Not you?** and sign in again.
3. Select **Allow**. You're sent back to Claude and the connector shows as connected.

If Resource Board asks you to choose a new password first, do that, then go back to Claude and select
**Connect** again.

### Use it in a chat

Turn Resource Board on for a chat from the tools menu in the message box (the exact label depends on
your Claude app). Then just ask, for example:

- "What's on my plate this week in Resource Board?"
- "Who is over-utilized over the next four weeks?"
- "Give me the monthly status report for NOVA and list the risks."
- "Log 3 hours on the login page task for today: finished the reset flow."
- "Which high-priority leads have a follow-up due this week?"
- "Move Acme Corp's lead to Proposal and set the next follow-up to Friday."

Claude asks for your approval before changing anything, depending on your Claude settings.

## Claude Code

Add the connector once (use your address):

```sh
claude mcp add --transport http resource-board https://board.example.com/mcp
```

Then, in a Claude Code session, run `/mcp`, choose **resource-board** and select **Authenticate**. Your
browser opens the same sign-in and **Allow** page as above.

Add `--scope project` to share the connector with everyone working in a repository (it's saved in
`.mcp.json`); each person still signs in as themselves.

## What Claude can do

| Tool            | What it does                                                        |
| --------------- | ------------------------------------------------------------------- |
| `whoami`        | Your name, email and role                                           |
| `list_projects` | Projects you can see                                                |
| `list_people`   | People, departments and roles                                       |
| `list_teams`    | Teams and members                                                   |
| `list_tasks`    | Tasks, filtered by project, assignee or status                      |
| `dashboard`     | KPIs, demand vs availability, department hours, utilization heatmap |
| `status_report` | Weekly or monthly project status report                             |
| `list_leads`    | The sales pipeline                                                  |
| `create_task`   | Create a task (admins; PMs on their projects)                       |
| `update_task`   | Change a task (assignees can change the status of their own tasks)  |
| `log_hours`     | Log hours on a task as you                                          |
| `create_lead`   | Add a sales lead (admins and sales)                                 |
| `update_lead`   | Change a lead, e.g. stage or next follow-up (admins and sales)      |

There are no delete tools: delete things in the app itself. If your role doesn't allow something,
Claude gets a "403" and tells you.

## Staying connected and disconnecting

- You stay connected for up to 30 days without using it; after that Claude asks you to sign in again.
- To disconnect, open **Settings → Connectors** in Claude (or `/mcp` in Claude Code) and disconnect
  Resource Board.
- If your account is deactivated or your role changes, that applies to Claude immediately.

## Troubleshooting

| What you see                                 | What to do                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "Couldn't connect" when adding the connector | Check the address ends in `/mcp` and opens in your browser. Otherwise ask your admin.      |
| "This connection request has expired"        | You took more than 15 minutes on the sign-in page. Select **Connect** in Claude again.     |
| Claude says it got a 403                     | Your role doesn't allow that action. Ask your PM or admin, or do it in the app if you can. |
| Claude says you must change your password    | Sign in to Resource Board in the browser, choose a new password, then reconnect.           |
| You connected the wrong account              | Disconnect in Claude, then connect again and use **Not you?** on the Resource Board page.  |

Prefer scripts over chat? See [How to use the Resource Board REST API](use-the-rest-api.md).
