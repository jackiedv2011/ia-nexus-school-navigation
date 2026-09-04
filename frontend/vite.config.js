import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // A dedicated, unusual port — not Vite's default 5173 — specifically so
    // this project can never collide with another project's dev server (e.g.
    // AP Leak Finder, which also runs on 5173) that happens to already be
    // running. strictPort refuses to silently fall back to some OTHER random
    // port if 5183 is somehow taken; better to fail loudly than to guess.
    port: 5183,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
