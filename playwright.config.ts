import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  /**
   * Each e2e test renders a Mapbox GL map, which headless Chromium draws with
   * SwiftShader on the CPU. Three of those at once starve the machine and the
   * map's `load` event arrives after the test has already given up, so the
   * suite fails in ways that have nothing to do with the code.
   */
  workers: 2,
  /**
   * Assertions wait longer than Playwright's 5s default: two workers each
   * rendering a Mapbox GL map through SwiftShader contend for the CPU, and a
   * marker's attributes can land well after the map reports itself loaded.
   */
  expect: { timeout: 15_000 },
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

  // The prod project talks to the live site; everything else needs the local
  // server started below.
  projects: [
    // Pure logic: timeline maths, tide detection, catalogue integrity.
    { name: 'unit', testMatch: /tests\/unit\/.*\.spec\.ts/ },
    {
      name: 'e2e',
      testMatch: /tests\/e2e\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Opt-in: runs against the live deployment, so it is excluded from the
    // default run and needs no local server.
    {
      name: 'prod',
      testMatch: /tests\/prod\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: undefined },
    },
    // Opt-in: rates five regions over the whole horizon against today's real
    // forecast and checks the stability and coherence targets of the rating.
    // Upstream responses are cached in .cache/rating-trust, so repeats are free.
    { name: 'measure', testMatch: /tests\/measure\/.*\.spec\.ts/ },
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
