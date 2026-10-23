import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Read PORT from the monorepo root .env so the proxy always targets the API.
  const env = loadEnv(mode, '../../', '');
  // API_PORT lets the UAT environment point at its own API (see scripts/uat.mjs).
  const apiPort = process.env.API_PORT || env.PORT || '4100';
  const proxy = { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true } };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy,
    },
    // `vite preview` serves the production build (used for UAT) with the same API proxy.
    preview: { proxy },
  };
});
