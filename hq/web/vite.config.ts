import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Built files are served by the engine at /hq/ (and at / on HQ_HOST); the API is /hq/api on both.
// `npm run dev` proxies the API to a local engine on :8080.
export default defineConfig({
  base: '/hq/',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  server: { proxy: { '/hq/api': { target: 'http://127.0.0.1:8080', changeOrigin: false } } },
});
