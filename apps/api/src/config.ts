import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// Root .env (monorepo) first, then optional apps/api/.env overrides. Real env vars always win.
loadEnv({ path: path.resolve(here, '../../../.env'), quiet: true });
loadEnv({ path: path.resolve(here, '../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5433/resource_board?schema=public'),
  JWT_SECRET: z.string().min(1).default('dev-only-insecure-secret'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * Public address of the app (what people open in the browser), e.g. https://board.example.com.
   * Turns on the Claude connector (MCP at /mcp, OAuth sign-in). Must be HTTPS outside localhost.
   */
  PUBLIC_URL: z.preprocess((v) => v || undefined, z.url().optional()),
  /**
   * Email domains allowed to self-register at /signup, comma-separated, e.g.
   * "example.com,example.in". Unset or empty (the default) turns sign-up off: admins add people
   * on the Team page.
   */
  SIGNUP_DOMAINS: z.string().optional(),
  /**
   * Folder for task attachments (M4 JIRA-lite), absolute or relative to the working directory.
   * Defaults to apps/api/uploads. In Docker, mount a volume here so files survive restarts.
   */
  UPLOAD_DIR: z.preprocess((v) => v || undefined, z.string().optional()),
  /**
   * Key for encrypting authenticator (MFA) secrets in the database. Optional: derived from
   * JWT_SECRET when unset. Changing it (or JWT_SECRET without it) means people set up MFA again.
   */
  MFA_ENCRYPTION_KEY: z.preprocess((v) => v || undefined, z.string().min(16).optional()),
  /**
   * JIRA two-way sync (M3). Jira Cloud site, e.g. https://example.atlassian.net, and the account
   * the sync acts as (an API token from id.atlassian.com). All three unset: sync is off.
   */
  JIRA_BASE_URL: z.preprocess((v) => v || undefined, z.url().optional()),
  JIRA_EMAIL: z.preprocess((v) => v || undefined, z.email().optional()),
  JIRA_API_TOKEN: z.preprocess((v) => v || undefined, z.string().optional()),
  /** Minutes between automatic syncs; 0 = only when someone clicks Sync now. */
  JIRA_SYNC_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),
  /** Largest attachment accepted, in megabytes. */
  MAX_UPLOAD_MB: z.coerce.number().positive().max(1024).default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  // Development and tests use the Vite dev server's address; production must set it explicitly.
  PUBLIC_URL:
    parsed.data.PUBLIC_URL ??
    (parsed.data.NODE_ENV === 'production' ? undefined : 'http://localhost:5173'),
  // Self-registration is off unless an operator lists domains (in every environment).
  SIGNUP_DOMAINS: (parsed.data.SIGNUP_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean),
  UPLOAD_DIR: path.resolve(parsed.data.UPLOAD_DIR ?? path.resolve(here, '../uploads')),
};

if (config.NODE_ENV === 'production' && config.JWT_SECRET === 'dev-only-insecure-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
