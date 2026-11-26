import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // The indexer decides which buckets the app offers to browse, so its
    // normalisation is tested alongside the app.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    // Primer's components import their own CSS files, which Node cannot load.
    // Inlining hands those imports to Vite, which stubs them.
    server: { deps: { inline: [/@primer\/react/] } },
  },
});
