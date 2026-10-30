import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { Role } from '../generated/prisma/enums.js';
import { HttpError } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email, role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Routes still open to someone who must change their password first. */
const PASSWORD_CHANGE_ROUTES = new Set(['/api/auth/me', '/api/auth/password']);

/**
 * Requires a valid `Authorization: Bearer <jwt>` header and sets `req.user`.
 * The token only proves identity: role and active status are read fresh on every request,
 * so a role change or removal takes effect immediately instead of when the token expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Authentication required'));
  }
  let id: string;
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_SECRET) as jwt.JwtPayload;
    // App tokens carry no audience; connector tokens (aud "mcp") only work at /mcp.
    if (payload.aud !== undefined) throw new Error('Wrong token audience');
    id = payload.sub as string;
  } catch {
    return next(new HttpError(401, 'Invalid or expired token'));
  }

  const person = await prisma.person.findUnique({
    where: { id },
    select: { email: true, role: true, active: true, mustChangePassword: true },
  });
  if (!person?.active) return next(new HttpError(401, 'Your account is no longer active'));

  req.user = { id, email: person.email, role: person.role };
  if (person.mustChangePassword && !PASSWORD_CHANGE_ROUTES.has(req.baseUrl + req.path)) {
    return next(
      new HttpError(403, 'Change your password to continue', { code: 'PASSWORD_CHANGE_REQUIRED' }),
    );
  }
  next();
}

/** Role guard: use after requireAuth, e.g. `router.post('/', requireRole(...STAFFING_ROLES), ...)`. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Insufficient role'));
    next();
  };
}

/**
 * Sales users work the leads pipeline and may read the project list; every other part of the
 * API (tasks, people, teams, dashboard, reports) is off limits to them.
 */
export function salesAreaGuard(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'SALES') return next();
  const path = req.baseUrl + req.path;
  const allowed =
    path.startsWith('/api/leads') ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/oauth/') ||
    (req.method === 'GET' && (path === '/api/projects' || path === '/api/projects/'));
  if (!allowed)
    return next(new HttpError(403, 'This part of the app isn’t available to sales users'));
  next();
}
