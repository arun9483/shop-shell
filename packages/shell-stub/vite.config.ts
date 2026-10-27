import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The stub page, served by the stub's server under /__stub/.
export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  base: '/__stub/',
  build: { outDir: '../../dist/client', emptyOutDir: true },
  test: { root: '.', include: ['src/server/**/*.test.ts'] },
});
