import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(({ mode }) => {
  // Read PORT from the monorepo root .env so the proxy always targets the API.
  const env = loadEnv(mode, '../../', '');
  // API_PORT lets the UAT environment point at its own API (see scripts/uat.mjs).
  const apiPort = process.env.API_PORT || env.PORT || '4100';
  const target = `http://localhost:${apiPort}`;
  // The Claude connector's MCP and OAuth endpoints live at the root, outside /api.
  const proxy = Object.fromEntries(
    ['/api', '/mcp', '/authorize', '/token', '/register', '/revoke', '/.well-known'].map((path) => [
      path,
      { target, changeOrigin: true },
    ]),
  );

  return {
    plugins: [react(), tailwindcss()],
    // Shown in the sign-in footer (lib/appConfig.ts).
    define: { __APP_VERSION__: JSON.stringify(version) },
    server: {
      port: 5173,
      proxy,
    },
    // `vite preview` serves the production build (used for UAT) with the same API proxy.
    preview: { proxy },
  };
});
