import { Router } from 'express';
import { type RateLimitInfo, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config.js';
import { HttpError, parse } from '../../lib/http.js';
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

/**
 * Per-address limit on failed sign-ins (successful ones don't count), on top of the per-account
 * lockout in lockout.ts. Higher than the per-account limit because an office shares one address.
 * express-rate-limit's default store is in memory: fine for the single API instance.
 */
const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;
const loginIpLimit = rateLimit({
  windowMs: LOGIN_IP_WINDOW_MS,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    const info = (req as typeof req & { rateLimit?: RateLimitInfo }).rateLimit;
    const reset = info?.resetTime?.getTime() ?? Date.now() + LOGIN_IP_WINDOW_MS;
    const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    res
      .status(429)
      .set('Retry-After', String(retryAfterSeconds))
      .json({
        error: 'Too many sign-in attempts from this network. Try again later.',
        details: { code: 'RATE_LIMITED', retryAfterSeconds },
      });
  },
});

authRouter.post('/login', loginIpLimit, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  try {
    res.json(await service.login(email, password, req.ip));
  } catch (err) {
    // A locked account says when to try again, in the header as well as the body.
    const retry = (err as HttpError).details as { retryAfterSeconds?: number } | undefined;
    if (err instanceof HttpError && err.status === 423 && retry?.retryAfterSeconds) {
      res.set('Retry-After', String(retry.retryAfterSeconds));
    }
    throw err;
  }
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

// TODO(M3): Azure AD SSO (OIDC) sign-in (the web app links to /api/auth/sso/microsoft when
// VITE_SSO_ENABLED is on). Password sign-ins are audit-logged in auth.service.ts.
