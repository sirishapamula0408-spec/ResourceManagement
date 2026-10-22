import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { requireAuth } from '../../middleware/auth.js';
import * as service from './auth.service.js';

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  res.json(await service.login(email, password));
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await service.me(req.user!.id));
});

// TODO(M3): Azure AD SSO (OIDC) callback + audit log of sign-ins.
