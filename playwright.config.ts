import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    permissions: ['geolocation'],
    // A Basque-coast fixture keeps geolocation deterministic across machines.
    geolocation: { latitude: 43.3, longitude: -2.0 },
    locale: 'en-GB',
    timezoneId: 'Europe/Madrid',
  },

  projects: [
    // Pure logic: timeline maths, tide detection, catalogue integrity.
    { name: 'unit', testMatch: /tests\/unit\/.*\.spec\.ts/ },
    {
      name: 'e2e',
      testMatch: /tests\/e2e\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Tests run against the production build: it is what Vercel serves, and the
    // dev server's HMR channel does not hydrate reliably under Playwright.
    command: `npm run build && npx next start --port ${PORT}`,
    // Next 16 refuses a second dev server on the same project, so reuse one
    // if the developer already has it running.
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
