import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `base` comes from the environment so one build works at the site root and
 * under a GitHub Pages project path such as `/open-data-bucket-browser/`. The
 * app fetches its index relative to `import.meta.env.BASE_URL`, so this value
 * has to be the real mount point, not './'.
 */
export default defineConfig({
  base: process.env['VITE_BASE'] ?? '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
