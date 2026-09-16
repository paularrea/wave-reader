import { test, expect, Page } from '@playwright/test';

/**
 * End-to-end coverage of the flows in the change's specs. The forecast API is
 * stubbed so assertions are about the app's behaviour, not about what the sea
 * happens to be doing today.
 */

const MADRID_OFFSET = 2 * 3600;

interface StubOptions {
  windSpeed?: number | null;
  windDirection?: number | null;
  swellHeight?: number;
  stars?: number;
  dangerous?: boolean;
  tides?: Array<{ kind: 'high' | 'low'; timestamp: string; heightM: number }>;
  utcOffsetSeconds?: number;
}

const DEFAULT_TIDES = [
  { kind: 'high' as const, timestamp: '2026-09-16T03:00', heightM: 1.42 },
  { kind: 'low' as const, timestamp: '2026-09-16T09:00', heightM: -0.81 },
  { kind: 'high' as const, timestamp: '2026-09-16T15:00', heightM: 1.55 },
  { kind: 'low' as const, timestamp: '2026-09-16T21:00', heightM: -0.93 },
];

async function stubForecast(page: Page, options: StubOptions = {}) {
  const {
    windSpeed = 18,
    windDirection = 140,
    swellHeight = 1.5,
    stars = 7,
    dangerous = false,
    tides = DEFAULT_TIDES,
    utcOffsetSeconds = MADRID_OFFSET,
  } = options;

  await page.route('**/api/forecast*', async route => {
    const url = new URL(route.request().url());
    const spotId = url.searchParams.get('spotId');

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        spot: { id: spotId },
        stars,
        unrated: false,
        safety: {
          isDangerous: dangerous,
          reason: dangerous
            ? 'Waves at Playa de Razo are forecast at 2.4m, 1.4m above the 1m ceiling for beginners here.'
            : null,
        },
        forecast: {
          timestamp: '2026-09-16T15:00',
          swellHeight,
          swellPeriod: 12,
          swellDirection: 315,
          secondarySwellHeight: 0.6,
          secondarySwellPeriod: 8,
          secondarySwellDirection: 270,
          windWaveHeight: 0.4,
          windWavePeriod: 4,
          windWaveDirection: 140,
          windSpeed,
          windDirection,
          seaLevel: 0.42,
        },
        tides,
        timezone: 'Europe/Madrid',
        utcOffsetSeconds,
      }),
    });
  });
}

async function openFirstSpot(page: Page) {
  const marker = page.locator('[data-testid="spot-marker"]').first();
  await marker.waitFor({ state: 'attached', timeout: 45_000 });
  await marker.dispatchEvent('click');
  await expect(page.getByTestId('spot-drawer')).toBeVisible();
}

test.describe('map and spot detail', () => {
  test('the map renders and spots appear as markers', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    await expect(page.locator('.mapboxgl-map')).toBeVisible();
    await expect(page.locator('[data-testid="spot-marker"]').first()).toBeAttached({
      timeout: 45_000,
    });
  });

  test('REGRESSION: markers still render on a warm reload with the style cached', async ({ page }) => {
    // First load primes the browser cache; on the second the map can finish
    // loading before the `load` listener attaches, and that event is then
    // missed -- which left production showing an empty map under a permanent
    // "Loading Marine Data" overlay.
    await stubForecast(page);
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });

    await page.reload();

    await expect(page.locator('[data-testid="spot-marker"]').first()).toBeAttached({ timeout: 45_000 });
    await expect(page.getByText('Loading Marine Data')).toHaveCount(0);
  });

  test('spec: marine-data — the detail shows swell height, direction and wind', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('swell-height')).toHaveText('1.5m');
    await expect(page.getByTestId('swell-direction')).toHaveText('NW');
    await expect(page.getByTestId('wind-reading')).toHaveText('18 km/h SE');
  });

  test('spec: marine-data — wind is km/h and never the raw knots conversion', async ({ page }) => {
    await stubForecast(page, { windSpeed: 18 });
    await page.goto('/');
    await openFirstSpot(page);

    // 18 * 1.852 = 33 was the old bug; the provider value must survive intact.
    await expect(page.getByTestId('wind-reading')).toContainText('18 km/h');
    await expect(page.getByTestId('wind-reading')).not.toContainText('33');
  });

  test('spec: marine-data — the extended sea state is available', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('secondary-swell')).toContainText('0.6m');
    await expect(page.getByTestId('secondary-swell')).toContainText('8s');
    await expect(page.getByTestId('wind-waves')).toContainText('0.4m');
  });

  test('REGRESSION: absent wind reads "No data" and shows no Glass badge', async ({ page }) => {
    await stubForecast(page, { windSpeed: null, windDirection: null });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('wind-reading')).toHaveText('No data');
    await expect(page.getByTestId('wind-reading')).not.toContainText('0km/h');
    await expect(page.getByTestId('wind-badge')).toHaveCount(0);
  });
});

test.describe('spec: condition-rating', () => {
  test('an offshore wind shows a green Off-shore badge', async ({ page }) => {
    await stubForecast(page, { windSpeed: 18, windDirection: 140 });
    await page.goto('/');
    await openFirstSpot(page);

    const badge = page.getByTestId('wind-badge');
    await expect(badge).toHaveText('Off-shore');
    await expect(badge).toHaveCSS('background-color', 'rgb(34, 197, 94)');
  });

  test('an onshore wind shows a grey On-shore badge', async ({ page }) => {
    await stubForecast(page, { windSpeed: 18, windDirection: 320 });
    await page.goto('/');
    await openFirstSpot(page);

    const badge = page.getByTestId('wind-badge');
    await expect(badge).toHaveText('On-shore');
    await expect(badge).toHaveCSS('background-color', 'rgb(113, 113, 122)');
  });

  test('no map marker is rendered in green', async ({ page }) => {
    await stubForecast(page, { stars: 4 });
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });

    const colors = await page
      .locator('[data-testid="spot-marker"]')
      .evaluateAll(nodes => nodes.map(n => getComputedStyle(n).backgroundColor));

    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      const [r, g] = color.match(/\d+/g)!.slice(0, 2).map(Number);
      expect(g, `marker rendered ${color}`).toBeLessThanOrEqual(r);
    }
  });

  test('a beginner over the limit sees a red alert explaining why', async ({ page }) => {
    await stubForecast(page, { dangerous: true, swellHeight: 2.4, stars: 2 });
    await page.goto('/');
    await page.getByTestId('level-beginner').click();
    await openFirstSpot(page);

    const alert = page.getByTestId('danger-alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('2.4m');
    await expect(alert).toContainText('beginners');
  });

  test('a dangerous spot is flagged red on the map', async ({ page }) => {
    await stubForecast(page, { dangerous: true, stars: 2 });
    await page.goto('/');
    await page.getByTestId('level-beginner').click();

    const marker = page.locator('[data-testid="spot-marker"][data-dangerous="true"]').first();
    await expect(marker).toBeAttached({ timeout: 45_000 });
    await expect(marker).toHaveCSS('background-color', 'rgb(239, 68, 68)');
  });
});

test.describe('spec: tide-extremes', () => {
  test('high and low tides for the day are listed', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);

    const tides = page.getByTestId('tides-section');
    await expect(tides).toBeVisible();
    await expect(page.getByTestId('tide-high')).toHaveCount(2);
    await expect(page.getByTestId('tide-low')).toHaveCount(2);
    await expect(tides).toContainText('03:00');
    await expect(tides).toContainText('21:00');
  });

  test('a spot with no tide data says so instead of showing times', async ({ page }) => {
    await stubForecast(page, { tides: [] });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('tides-section')).toContainText('No data');
    await expect(page.getByTestId('tide-high')).toHaveCount(0);
  });
});

test.describe('spec: forecast-timeline', () => {
  test('the timeline opens on the next whole hour, not the current minute', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') }); // 14:20 in Madrid
    await stubForecast(page);
    await page.goto('/');

    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 15:00');
  });

  test('each slider step advances exactly one hour', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page);
    await page.goto('/');

    const slider = page.getByLabel('Forecast hour');
    await slider.fill('1');
    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 16:00');
    await slider.fill('2');
    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 17:00');
  });

  test('crossing midnight flips the day label', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T20:20:00Z') }); // 22:20 Madrid
    await stubForecast(page);
    await page.goto('/');

    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 23:00');

    await page.getByLabel('Forecast hour').fill('1');
    await expect(page.getByTestId('forecast-time')).toHaveText('Tomorrow, 00:00');
  });

  test('the day strip lets you jump between days', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page);
    await page.goto('/');

    const chips = page.getByTestId('day-chip');
    // The strip uses compact labels so eight days fit without ellipses.
    await expect(chips.first()).toHaveText('Today');
    await expect(chips.nth(1)).toHaveText('Tmrw');

    await chips.nth(1).click();
    await expect(page.getByTestId('forecast-time')).toContainText('Tomorrow');
    await expect(chips.nth(1)).toHaveAttribute('data-active', 'true');
  });

  test('the slider is controlled and stays in sync with the label', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page);
    await page.goto('/');

    await page.getByTestId('day-chip').nth(1).click();
    // Jumping via a chip must move the slider too, not just the label.
    await expect(page.getByLabel('Forecast hour')).not.toHaveValue('0');
  });
});
