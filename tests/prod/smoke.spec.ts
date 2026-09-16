import { test, expect } from '@playwright/test';

/**
 * Smoke test against the live deployment. Not part of the default run: it hits
 * the real Open-Meteo API and the real Mapbox account.
 *
 *   npx playwright test --project=prod
 */
const PROD_URL = process.env.PROD_URL ?? 'https://wave-reader-theta.vercel.app/';

test('the deployed app serves a working forecast', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)));

  await page.goto(PROD_URL);

  const markers = page.locator('[data-testid="spot-marker"]');
  await expect(markers.first()).toBeAttached({ timeout: 45_000 });
  await expect(page.getByText('Loading Marine Data')).toHaveCount(0);

  // The quality ramp must stay yellow everywhere: green once meant "mediocre".
  const colors = await markers.evaluateAll(nodes =>
    nodes.map(n => getComputedStyle(n).backgroundColor)
  );
  for (const color of colors) {
    const [r, g] = color.match(/\d+/g)!.slice(0, 2).map(Number);
    expect(g, `marker rendered ${color}`).toBeLessThanOrEqual(r);
  }

  await markers.first().dispatchEvent('click');
  await expect(page.getByTestId('spot-drawer')).toBeVisible();

  // Real wind must arrive as a number with units, never the old "0km/h" that a
  // null reading used to collapse into. "--" is the pre-fetch placeholder.
  const windReading = page.getByTestId('wind-reading');
  await expect(windReading).not.toHaveText('--', { timeout: 30_000 });
  const wind = await windReading.textContent();
  expect(wind).toMatch(/^\d+ km\/h [NSEW]{1,3}$|^No data$/);
  expect(wind).not.toBe('0 km/h');

  await expect(page.getByTestId('swell-height')).toContainText('m');
  await expect(page.getByTestId('tides-section')).toBeVisible();

  expect(errors).toEqual([]);

  await page.screenshot({ path: 'test-results/prod-map.png' });
  await page.getByTestId('spot-drawer').screenshot({ path: 'test-results/prod-drawer.png' });
});
