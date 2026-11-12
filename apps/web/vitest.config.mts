// Configuración de los tests de componentes (plan 002, sección 7.1).
// Sigue la guía de Next 16: node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Vite lee los "paths" de tsconfig.json (el atajo @/) sin plugins aparte.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Solo tests/: los de Playwright (e2e/*.spec.ts) los corre Playwright, no Vitest.
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
