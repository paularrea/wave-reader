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
  // null reading used to collapse into. An em dash is the pre-fetch placeholder.
  const windReading = page.getByTestId('wind-reading');
  await expect(windReading).toHaveText(/km\/h|No data/, { timeout: 30_000 });
  const wind = (await windReading.textContent())!;
  expect(wind).toMatch(/^\d+ km\/h$|^No data$/);
  expect(wind).not.toBe('0 km/h');

  await expect(page.getByTestId('swell-height')).toContainText('m');
  // Present even where there is nothing to show: Mediterranean spots have
  // tides below the prominence floor and must say so rather than stay blank.
  await expect(page.getByTestId('tides-section')).toBeVisible();

  // The week at a glance and day navigation must work on the live site too.
  await expect(page.getByTestId('timeline-pill').first()).toBeVisible();
  expect(await page.getByTestId('timeline-pill').count()).toBeGreaterThan(40);
  await expect(page.getByTestId('forecast-error')).toHaveCount(0);
  await expect(page.getByTestId('drawer-day-tab').first()).toBeVisible();
  await page.getByTestId('hour-next').click();
  await expect(page.getByTestId('drawer-time')).toBeVisible();

  expect(errors).toEqual([]);

  await page.screenshot({ path: 'test-results/prod-map.png' });
  await page.getByTestId('spot-drawer').screenshot({ path: 'test-results/prod-drawer.png' });
});
