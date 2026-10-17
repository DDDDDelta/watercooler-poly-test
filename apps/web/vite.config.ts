import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Public URL prefix, e.g. BASE_PATH=/watercooler when served at https://example.com/watercooler/
 * behind a reverse proxy that strips the prefix. Defaults to the site root.
 */
const trimmed = (process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, '');
const base = trimmed ? `/${trimmed}/` : '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Mirror the production proxy: strip the base path before forwarding to the API server.
      [`${base}api`]: {
        target: `http://localhost:${process.env.API_PORT ?? 3000}`,
        rewrite: (path) => path.slice(base.length - 1),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
});
