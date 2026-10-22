import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { passwordSchema } from '../../lib/permissions.js';
import { requireAuth } from '../../middleware/auth.js';
import * as service from './auth.service.js';

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  res.json(await service.login(email, password));
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await service.me(req.user!.id));
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  await service.changePassword(req.user!.id, currentPassword, newPassword);
  res.status(204).end();
});

// TODO(M3): Azure AD SSO (OIDC) callback + audit log of sign-ins.
