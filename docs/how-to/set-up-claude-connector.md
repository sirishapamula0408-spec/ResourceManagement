# How to set up the Claude connector (admins)

**For:** whoever runs the Resource Board server, and your organization's Claude owner.

The connector lets everyone use Resource Board from Claude (web, desktop, mobile and Claude Code) with
their own account. It's built into the API: an MCP endpoint at `/mcp` and an OAuth sign-in that uses
the normal Resource Board login. Nothing extra to install.

## How it works

1. Someone adds the connector in Claude with the address `https://<your address>/mcp`.
2. Claude registers itself with Resource Board automatically (OAuth dynamic client registration).
3. The person is sent to `https://<your address>/connect`, signs in with their Resource Board account and
   selects **Allow**.
4. Claude gets a token for that person. Each tool call goes through the same API routes, role checks
   and visibility rules as the web app, so Claude can never do more than that person can.

| Item               | Lifetime / rule                                               |
| ------------------ | ------------------------------------------------------------- |
| Access token       | 1 hour; works only at `/mcp`, never on the app's own API      |
| Refresh token      | 30 days; replaced on every use; stored only as a SHA-256 hash |
| Sign-in request    | 15 minutes to finish the sign-in page                         |
| Deactivated person | Cut off on their next request; role changes apply immediately |

## 1. Give the app a public HTTPS address

claude.ai connects to the connector **from Anthropic's servers over the internet**, so the app must be
reachable at a public HTTPS address, for example `https://board.example.com`. Put HTTPS (a load
balancer, reverse proxy or your cloud's ingress) in front of the web container's port 8080.

Claude Code connects from each person's machine, so for Claude Code alone an internal address that
people can reach is enough.

If you restrict inbound traffic, allow Anthropic's published outbound IP addresses (see Anthropic's
documentation on IP addresses) to reach `/mcp`, `/authorize`, `/token`, `/register`, `/revoke` and
`/.well-known/oauth-*`. People's browsers must still be able to open `/connect` and sign in.

## 2. Turn the connector on

Set `PUBLIC_URL` to the public address (no trailing path) when starting the server:

```sh
JWT_SECRET=<long random value> PUBLIC_URL=https://board.example.com \
  docker compose -f deploy/docker-compose.server.yml up -d --build
```

The API container applies the database migration that adds the connector's tables when it starts.

- Without `PUBLIC_URL` in production, the connector is off and `/mcp` returns 404.
- `PUBLIC_URL` must use HTTPS unless it's `localhost`; the API refuses to start otherwise.
- Keep `JWT_SECRET` long, random and unchanged: changing it signs everyone out of the app and Claude.

`deploy/nginx.conf` already forwards the connector paths to the API. If you use your own proxy, forward
`/mcp`, `/authorize`, `/token`, `/register`, `/revoke` and `/.well-known/oauth-*` to the API, and serve
everything else (including `/connect`) from the web app.

## 3. Check it

```sh
curl -s https://board.example.com/.well-known/oauth-protected-resource/mcp
```

You should see `"resource":"https://board.example.com/mcp"`. Then add the connector to your own Claude
(see [How to connect Claude](connect-claude.md)) and ask "Who am I in Resource Board?".

## 4. Add it for everyone (Claude Team and Enterprise)

A Claude **owner** adds the connector once for the organization:

1. In Claude, open **Admin settings → Connectors** (organization settings).
2. Select **Add custom connector**, name it `Resource Board` and enter `https://board.example.com/mcp`.
   Leave the advanced OAuth client fields empty: Claude registers itself.
3. Save. Members then find Resource Board under **Settings → Connectors** and select **Connect** to
   sign in as themselves.

Menu names can change between Claude releases; if they differ, look for the custom connector settings
in your organization's admin area. Then share [How to connect Claude](connect-claude.md) with everyone.

## Security notes

- Claude only ever acts as the person who approved it, with their current role. Admins connecting
  Claude give it admin powers, so they should keep Claude's tool approval prompts on.
- There are no delete tools; deletions stay in the app.
- To cut off one person: deactivate them in the app (Team page). Their Claude stops working at once.
- To cut off everyone's Claude: unset `PUBLIC_URL` and restart, or change `JWT_SECRET` (this also signs
  everyone out of the web app).
- Registered clients, codes and refresh tokens are in the `OAuthClient`, `OAuthCode` and
  `OAuthRefreshToken` tables. Deleting a client row removes its tokens.

## Troubleshooting

| Problem                                                  | Check                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude: "Couldn't connect" / "couldn't reach the server" | Is `https://<address>/mcp` reachable from the internet? A `POST` without a token should return `401`.                                             |
| `/mcp` returns 404                                       | `PUBLIC_URL` isn't set for the API container.                                                                                                     |
| Sign-in page sends people to the wrong address           | `PUBLIC_URL` doesn't match the address people use.                                                                                                |
| "Too many requests" during a rollout                     | Limits are 500 registrations an hour and 1,000 token requests per 15 minutes per address; raise them in `apps/api/src/modules/mcp/mcp.router.ts`. |
| API won't start: issuer URL must be HTTPS                | Use an `https://` `PUBLIC_URL`.                                                                                                                   |

Developers can try the whole flow locally: `npm run dev`, then in Claude Code
`claude mcp add --transport http resource-board http://localhost:5173/mcp` and `/mcp` → Authenticate.
