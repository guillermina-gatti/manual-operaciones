// Tests en el navegador (plan 002, sección 7.2). Playwright levanta la web en el puerto 3001 (D3).
// - escritorio y celular: la API se simula en el navegador (e2e/support/mock-api.ts). `pnpm test:e2e`.
// - integracion: contra la API real en el puerto 3000, con Docker. `pnpm test:e2e:integracion` (T26).
import { defineConfig, devices } from '@playwright/test';

const REAL_AUTH = process.env.NEXT_PUBLIC_REAL_AUTH === 'true';
const PORT = REAL_AUTH ? 3002 : 3001;
const INTEGRATION_DIR = /e2e[\\/]integracion[\\/]/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'escritorio',
      testIgnore: INTEGRATION_DIR,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // F10: las pantallas también se usan desde el celular.
      name: 'celular',
      testIgnore: INTEGRATION_DIR,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'integracion',
      testMatch: INTEGRATION_DIR,
      // La subida de 10 MB pasa por la web, el rewrite y la API: tarda más que un test simulado.
      timeout: 60_000,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Nunca reutiliza un servidor previo para evitar mezclar sesión simulada y sesión real.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_REAL_AUTH: REAL_AUTH ? 'true' : 'false',
    },
  },
});
