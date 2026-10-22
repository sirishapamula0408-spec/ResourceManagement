import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load the monorepo root .env first, then an optional apps/api/.env override.
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });
loadEnv({ path: path.resolve(import.meta.dirname, '.env'), override: true, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Fallback keeps `prisma generate` working (e.g. on postinstall) before .env exists.
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/resource_board?schema=public',
  },
});
