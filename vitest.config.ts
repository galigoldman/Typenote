import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      // Pure extension helpers (no chrome/DOM globals at import) run under the
      // same jsdom runner — keeps them in the single `pnpm test` CI step.
      'extension/src/**/*.{test,spec}.ts',
    ],
    exclude: [
      'node_modules',
      'e2e',
      'src/**/*.integration.test.ts',
      'extension/node_modules',
      'extension/dist',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/font/google': path.resolve(
        __dirname,
        './src/test/__mocks__/next-font.ts',
      ),
    },
  },
});
