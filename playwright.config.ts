import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the built API and an e2e build of the web app against their own database
 * (`resource_board_e2e`), reset with the sample data before every run (see e2e/global-setup.ts). Run with `npm run e2e`.
 * Locally they use the installed Microsoft Edge; CI uses Playwright's Chromium.
 */
const CI = !!process.env.CI;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/resource_board_e2e?schema=public';
const API_PORT = '4300';
const WEB_PORT = 4174;
/** Where the e2e build of the web app goes (relative to apps/web). */
const E2E_WEB_DIR = 'node_modules/.e2e-build';
/** VITE_ADMIN_EMAIL for the e2e build ("Contact your administrator", "Email administrator"). */
export const E2E_ADMIN_EMAIL = 'it-support@resourceboard.local';

export default defineConfig({
  testDir: 'e2e',
  // Tests share one database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: CI ? 1 : 0,
  // On CI, 'github' turns failures into annotations readable on the run's page.
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
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
      // Its own build of the web app (VITE_* settings are fixed at build time), so the e2e
      // settings, e.g. an administrator address, don't end up in apps/web/dist.
      command: `npm exec -w @rb/web -- vite build --outDir ${E2E_WEB_DIR} --emptyOutDir && npm run preview -w @rb/web -- --outDir ${E2E_WEB_DIR} --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PORT, VITE_ADMIN_EMAIL: E2E_ADMIN_EMAIL },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
