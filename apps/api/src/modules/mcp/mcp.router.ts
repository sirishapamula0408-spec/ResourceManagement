import { type Express, Router } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthUser } from '../../middleware/auth.js';
import { oauthProvider } from './oauth.provider.js';
import { createMcpServer, loopbackApi } from './tools.js';

/**
 * The Claude connector: OAuth endpoints (/authorize, /token, /register, /revoke and their
 * .well-known metadata) plus the MCP endpoint itself at /mcp. Mounted at the app root.
 */
export function mcpRouter(app: Express, publicUrl: string) {
  const mcpUrl = new URL('/mcp', publicUrl);
  const callApi = loopbackApi(app);
  const router = Router();

  router.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(publicUrl),
      resourceServerUrl: mcpUrl,
      resourceName: 'Resource Board',
      // Everyone's Claude traffic comes from the same few addresses, so the per-IP limits
      // must allow a whole company signing in at once.
      clientRegistrationOptions: { rateLimit: { windowMs: 60 * 60 * 1000, limit: 500 } },
      tokenOptions: { rateLimit: { windowMs: 15 * 60 * 1000, limit: 1000 } },
    }),
  );

  // Stateless: a fresh server and transport per request, bound to the token's user.
  router.post(
    '/mcp',
    requireBearerAuth({
      verifier: oauthProvider,
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
    }),
    async (req, res) => {
      const server = createMcpServer(callApi(req.auth!.extra!.user as AuthUser));
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    },
  );

  // No server-initiated streams or sessions in stateless mode.
  router.all('/mcp', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'Method not allowed' });
  });

  return router;
}
