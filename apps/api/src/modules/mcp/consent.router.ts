import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import {
  approveConsent,
  clientName,
  clientRedirect,
  readConsentRequest,
} from './oauth.provider.js';

const ticketBody = z.object({ request: z.string().min(1) });

/**
 * The consent page (/connect) for the Claude connector. The signed-in person sees which app is
 * asking, then approves or declines; the answer is a redirect back to that app.
 */
export const consentRouter = Router();

consentRouter.get('/request', async (req, res) => {
  const request = readConsentRequest(parse(ticketBody, req.query).request);
  res.json({
    clientName: await clientName(request.clientId),
    redirectHost: new URL(request.redirectUri).host,
  });
});

consentRouter.post('/approve', async (req, res) => {
  const request = readConsentRequest(parse(ticketBody, req.body).request);
  res.json({ redirect: await approveConsent(request, req.user!.id) });
});

consentRouter.post('/deny', async (req, res) => {
  const request = readConsentRequest(parse(ticketBody, req.body).request);
  res.json({
    redirect: clientRedirect(request, {
      error: 'access_denied',
      error_description: 'The user declined the connection',
    }),
  });
});
