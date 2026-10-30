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
};

if (config.NODE_ENV === 'production' && config.JWT_SECRET === 'dev-only-insecure-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
