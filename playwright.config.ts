import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the built app against its own database (`resource_board_e2e`), reset with
 * the sample data before every run (see e2e/global-setup.ts). Run with `npm run e2e`.
 * Locally they use the installed Microsoft Edge; CI uses Playwright's Chromium.
 */
const CI = !!process.env.CI;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/resource_board_e2e?schema=public';
const API_PORT = '4300';
const WEB_PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  // Tests share one database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: CI ? 'chromium' : 'edge',
      use: { ...devices['Desktop Chrome'], ...(CI ? {} : { channel: 'msedge' }) },
    },
  ],
  webServer: [
    {
      command: 'node apps/api/dist/server.js',
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        PORT: API_PORT,
        NODE_ENV: 'production',
        JWT_SECRET: 'e2e-only-secret',
      },
      reuseExistingServer: false,
    },
    {
      command: `npm run preview -w @rb/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PORT },
      reuseExistingServer: false,
    },
  ],
});
