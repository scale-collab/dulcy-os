import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Built files are served by the engine at /hq/ (and at / on HQ_HOST); the API is /hq/api on both.
// Two entries: index.html (HQ) and portal.html (the client portal, portal.dulcy.io): the portal bundle
// holds none of HQ's screens. `npm run dev` proxies the API to a local engine on :8080.
export default defineConfig({
  base: '/hq/',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, rollupOptions: { input: { index: 'index.html', portal: 'portal.html' } } },
  server: { proxy: { '/hq/api': { target: 'http://127.0.0.1:8080', changeOrigin: false } } },
});
