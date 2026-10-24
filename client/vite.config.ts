import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    // Maps are uploaded to New Relic and then deleted (scripts/sourcemaps.mjs); no file links to them.
    sourcemap: 'hidden',
  },
  test: {
    environment: 'jsdom',
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
