import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config.js';
import { parse } from '../../lib/http.js';
import { passwordSchema } from '../../lib/permissions.js';
import { requireAuth } from '../../middleware/auth.js';
import * as service from './auth.service.js';

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Add your name').max(120),
  email: z.email(),
  password: passwordSchema,
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

// Whether the login page offers sign-up, and for which email domains.
authRouter.get('/signup', (_req, res) => {
  res.json({ domains: config.SIGNUP_DOMAINS });
});

authRouter.post(
  '/signup',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
  async (req, res) => {
    res.status(201).json(await service.signup(parse(signupSchema, req.body)));
  },
);

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await service.me(req.user!.id));
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  await service.changePassword(req.user!.id, currentPassword, newPassword);
  res.status(204).end();
});

// TODO(M3): Azure AD SSO (OIDC) callback + audit log of sign-ins.
