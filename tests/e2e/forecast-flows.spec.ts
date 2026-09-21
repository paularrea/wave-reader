import { test, expect, Page } from '@playwright/test';
import { allSpots } from '../../src/services/spot-catalogue';

const spotIndex = allSpots();
import { regionOrder } from '../../src/services/spot-batches';
import { DEFAULT_REGION } from '../../src/services/regions';

/**
 * End-to-end coverage of the flows in the change's specs. The forecast API is
 * stubbed so assertions are about the app's behaviour, not about what the sea
 * happens to be doing today.
 */

const MADRID_OFFSET = 2 * 3600;

interface StubOptions {
  swellStars?: number;
  windSpeed?: number | null;
  windDirection?: number | null;
  swellHeight?: number;
  stars?: number;
  dangerous?: boolean;
  tides?: Array<{ kind: 'high' | 'low'; timestamp: string; heightM: number }>;
  utcOffsetSeconds?: number;
  /** Clock the page runs on, so the stubbed series starts at the page's anchor hour. */
  now?: number;
  /** Per-hour rating, for timeline scenarios. Defaults to `stars` everywhere. */
  starsAt?: (hourOffset: number) => number;
  /** Status codes to answer the series route with, in order, before succeeding. */
  seriesFailures?: number[];
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
    swellStars,
    dangerous = false,
    tides = DEFAULT_TIDES,
    utcOffsetSeconds = MADRID_OFFSET,
    now,
    starsAt,
    seriesFailures = [],
  } = options;

  const SPOT_CONFIG = {
    swellWindow: { minAngle: 280, maxAngle: 340 },
    offshoreWindAngle: 140,
    windTolerance: 30,
    idealHeight: {
      beginner: { min: 0.5, max: 1 },
      intermediate: { min: 1, max: 2 },
      expert: { min: 2, max: 4 },
    },
  };
  const reason = dangerous
    ? 'Waves at Playa de Razo are forecast at 2.4m, 1.4m above the 1m ceiling for beginners here.'
    : null;
  const forecastAt = (timestamp: string) => ({
    timestamp,
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
  });

  // The detail loads the whole horizon at once, starting at the page's anchor.
  const failures = [...seriesFailures];
  await page.route('**/api/forecast/series*', async route => {
    const failure = failures.shift();
    if (failure !== undefined) {
      await route.fulfill({ status: failure, contentType: 'application/json', body: '{"error":"stubbed failure"}' });
      return;
    }
    const clock = now ?? Date.now();
    const local = clock + utcOffsetSeconds * 1000;
    const anchor = Math.ceil(local / 3_600_000) * 3_600_000;
    const hours = Array.from({ length: 169 }, (_, i) => {
      const timestamp = new Date(anchor + i * 3_600_000).toISOString().slice(0, 13) + ':00';
      const hourStars = starsAt ? starsAt(i) : stars;
      return {
        stars: hourStars,
        swellStars: swellStars ?? hourStars,
        energyKj: 820,
        breakingHeightM: 1.9,
        unrated: false,
        safety: { isDangerous: dangerous, reason },
        forecast: forecastAt(timestamp),
      };
    });
    const tidesByDay: Record<string, typeof tides> = {};
    for (const h of hours) tidesByDay[h.forecast.timestamp.slice(0, 10)] = tides;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        spot: { id: new URL(route.request().url()).searchParams.get('spotId'), config: SPOT_CONFIG },
        timezone: 'Europe/Madrid',
        utcOffsetSeconds,
        tidesByDay,
        hours,
      }),
    });
  });

  // The map scores spots in batches carrying the whole horizon from the anchor UTC hour.
  await page.route('**/api/forecast/batch*', async route => {
    const url = new URL(route.request().url());
    const region = url.searchParams.get('region') ?? '';
    const chunk = Number(url.searchParams.get('chunk') ?? 0);
    const members = regionOrder(spotIndex, region).slice(chunk * 50, (chunk + 1) * 50);
    const clock = now ?? Date.now();
    const start = new Date(Math.ceil(clock / 3_600_000) * 3_600_000).toISOString().slice(0, 13) + ':00';
    const hours = Array.from({ length: 169 }, (_, h) => h);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        region,
        chunk,
        start,
        results: members.map(m => ({
          id: m.id,
          hasData: true,
          stars: hours.map(h => (starsAt ? starsAt(h) : stars)),
          swellStars: hours.map(h => swellStars ?? (starsAt ? starsAt(h) : stars)),
          height: hours.map(() => Math.round(swellHeight * 10)),
          period: hours.map(() => 12),
          danger: dangerous ? hours : [],
        })),
      }),
    });
  });

  await page.route('**/api/forecast?*', async route => {
    const url = new URL(route.request().url());
    const spotId = url.searchParams.get('spotId');

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        // The drawer reads surf config from the response: the client index
        // carries only what a marker needs.
        spot: {
          id: spotId,
          config: {
            swellWindow: { minAngle: 280, maxAngle: 340 },
            offshoreWindAngle: 140,
            windTolerance: 30,
            idealHeight: {
              beginner: { min: 0.5, max: 1 },
              intermediate: { min: 1, max: 2 },
              expert: { min: 2, max: 4 },
            },
          },
        },
        stars,
        swellStars: swellStars ?? stars,
        energyKj: 820,
        breakingHeightM: 1.9,
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

/** Opens the region picker and chooses a region by name. */
async function pickRegion(page: Page, region: string) {
  await page.getByTestId('region-button').click();
  await expect(page.getByTestId('region-picker')).toBeVisible();
  await page.getByTestId('region-search').fill(region);
  await page.locator(`[data-testid="region-option"][data-region="${region}"]`).click();
  await expect(page.getByTestId('region-picker')).toHaveCount(0);
}

async function pickLevel(page: Page, level: 'beginner' | 'intermediate' | 'expert') {
  await page.getByTestId('level-button').click();
  await page.getByTestId(`level-${level}`).click();
  await expect(page.getByTestId('level-button')).toHaveAttribute('data-level', level);
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

    await expect(page.getByTestId('swell-height')).toHaveText('1.5 m');
    await expect(page.getByTestId('swell-direction')).toHaveText('NW');
    await expect(page.getByTestId('wind-reading')).toHaveText('18 km/h');
    await expect(page.getByTestId('wind-direction')).toHaveText('SE');
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
  test('an offshore wind shows a green Offshore badge', async ({ page }) => {
    await stubForecast(page, { windSpeed: 18, windDirection: 140 });
    await page.goto('/');
    await openFirstSpot(page);

    const badge = page.getByTestId('wind-badge');
    await expect(badge).toHaveText('Offshore');
    await expect(badge).toHaveCSS('color', 'rgb(134, 239, 172)');
  });

  test('an onshore wind shows a grey Onshore badge', async ({ page }) => {
    await stubForecast(page, { windSpeed: 18, windDirection: 320 });
    await page.goto('/');
    await openFirstSpot(page);

    const badge = page.getByTestId('wind-badge');
    await expect(badge).toHaveText('Onshore');
    await expect(badge).toHaveCSS('color', 'rgb(212, 212, 216)');
  });

  test('a light onshore wind shows a green Light badge, not Onshore', async ({ page }) => {
    await stubForecast(page, { windSpeed: 7, windDirection: 320 });
    await page.goto('/');
    await openFirstSpot(page);

    const badge = page.getByTestId('wind-badge');
    await expect(badge).toHaveText('Light');
    await expect(badge).toHaveCSS('color', 'rgb(134, 239, 172)');
    await expect(page.getByTestId('spot-verdict')).toContainText('light onshore wind');
  });

  test('no visible text uses the retired spellings or level names', async ({ page }) => {
    await stubForecast(page, { windSpeed: 18, windDirection: 320, stars: 7, swellStars: 9 });
    await page.goto('/');
    await openFirstSpot(page);
    const drawer = await page.getByTestId('spot-drawer').innerText();
    await page.keyboard.press('Escape');
    await page.getByTestId('info-button').click();
    const panel = await page.getByTestId('info-panel').innerText();

    for (const retired of ['On-shore', 'Off-shore', 'Excellent', 'Surfable']) {
      expect(drawer).not.toContain(retired);
      expect(panel).not.toContain(retired);
    }
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
      if (color === 'rgba(0, 0, 0, 0)') continue; // unrated markers are hollow
      const [r, g] = color.match(/\d+/g)!.slice(0, 2).map(Number);
      expect(g, `marker rendered ${color}`).toBeLessThanOrEqual(r);
    }
  });

  test('the three quality tiers are visually distinct on the map', async ({ page }) => {
    // The complaint that started this: several yellows at different opacity
    // were indistinguishable, so the map could not be read at a glance.
    const sizes: Record<string, number> = {};

    for (const [tier, stars] of [['epic', 7], ['good', 3], ['poor', 0]] as const) {
      await stubForecast(page, { stars });
      await page.goto('/');
      await page
        .locator('[data-testid="spot-marker"]')
        .first()
        .waitFor({ state: 'attached', timeout: 45_000 });

      // The region fly-to fires moveend, which rebuilds the marker layer; a
      // node captured before that settles is detached by the time it is
      // measured and reports a zero-width box.
      await page.waitForTimeout(2500);

      const marker = page.locator('[data-testid="spot-marker"]').first();
      await expect(marker).toHaveAttribute('data-tier', tier);
      sizes[tier] = await marker.evaluate(n => n.getBoundingClientRect().width);
      expect(sizes[tier], `${tier} marker has no box`).toBeGreaterThan(0);
    }

    expect(sizes.epic).toBeGreaterThan(sizes.good);
    expect(sizes.good).toBeGreaterThan(sizes.poor);
  });

  test('only the best spots print their score on the marker', async ({ page }) => {
    await stubForecast(page, { stars: 9 });
    await page.goto('/');
    const epic = page.locator('[data-testid="spot-marker"]').first();
    await epic.waitFor({ state: 'attached', timeout: 45_000 });
    await expect(epic).toHaveText('9');

    await stubForecast(page, { stars: 0 });
    await page.goto('/');
    const poor = page.locator('[data-testid="spot-marker"]').first();
    await poor.waitFor({ state: 'attached', timeout: 45_000 });
    await expect(poor).toHaveText('');
  });

  test('the legend is the first thing in the info panel', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    // Not over the map any more: it cost more space on a phone than it explained.
    await expect(page.getByTestId('quality-legend')).toHaveCount(0);

    await page.getByTestId('info-button').click();
    const legend = page.getByTestId('quality-legend');
    await expect(legend).toBeVisible();
    const first = await page.getByTestId('info-panel').locator('section').first().getAttribute('data-testid');
    expect(first).toBe('quality-legend');
    for (const tier of ['epic', 'good', 'poor', 'danger']) {
      await expect(page.getByTestId(`legend-${tier}`)).toBeVisible();
    }
  });

  test('a beginner over the limit sees a red alert explaining why', async ({ page }) => {
    await stubForecast(page, { dangerous: true, swellHeight: 2.4, stars: 2 });
    await page.goto('/');
    await pickLevel(page, 'beginner');
    await openFirstSpot(page);

    const alert = page.getByTestId('danger-alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('2.4m');
    await expect(alert).toContainText('beginners');
  });

  test('a dangerous spot is flagged red on the map', async ({ page }) => {
    await stubForecast(page, { dangerous: true, stars: 2 });
    await page.goto('/');
    await pickLevel(page, 'beginner');

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
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');

    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 15:00');
  });

  test('each slider step advances exactly one hour', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');

    const slider = page.getByLabel('Forecast hour');
    await slider.fill('1');
    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 16:00');
    await slider.fill('2');
    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 17:00');
  });

  test('crossing midnight flips the day label', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T20:20:00Z') }); // 22:20 Madrid
    await stubForecast(page, { now: (new Date('2026-09-16T20:20:00Z')).valueOf() });
    await page.goto('/');

    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 23:00');

    await page.getByLabel('Forecast hour').fill('1');
    await expect(page.getByTestId('forecast-time')).toHaveText('Tomorrow, 00:00');
  });

  test('the day strip lets you jump between days', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
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
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');

    await page.getByTestId('day-chip').nth(1).click();
    // Jumping via a chip must move the slider too, not just the label.
    await expect(page.getByLabel('Forecast hour')).not.toHaveValue('0');
  });
});

test.describe('spec: region-selection', () => {
  test('there is no "all regions" option', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    await page.getByTestId('region-button').click();
    const options = await page.getByTestId('region-option').allTextContents();
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.toLowerCase()).not.toContain('all');
    }
  });

  test('geolocation picks the region of the nearest coast', async ({ page, context }) => {
    // Basque coast: the default (Cataluña) must be overridden.
    await context.setGeolocation({ latitude: 43.29, longitude: -2.15 });
    await stubForecast(page);
    await page.goto('/');

    await expect(page.getByTestId('region-button')).toHaveAttribute('data-region', 'País Vasco', { timeout: 15_000 });
  });

  test('without geolocation the region falls back to the default', async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await stubForecast(page);
    await page.goto('/');

    // Asserted against the exported default rather than a hard-coded name, so
    // this stays a test of the fallback behaviour. That the default is
    // Cataluña is asserted in tests/unit/regions.spec.ts against the catalogue.
    await expect(page.getByTestId('region-button')).toHaveAttribute('data-region', DEFAULT_REGION);
    await context.close();
  });

  test('a manual pick is not overwritten by a late geolocation callback', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    await pickRegion(page, 'Galicia');
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('region-button')).toHaveAttribute('data-region', 'Galicia');
  });
});

test.describe('spec: drawer-ux', () => {
  test('the Go to Spot action is reachable without scrolling the drawer', async ({ page }) => {
    // It used to sit at the end of the scroll area, below the fold and in
    // practice unreachable on a phone.
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);

    const action = page.getByTestId('go-to-spot');
    await expect(action).toBeInViewport();
    await expect(action).toHaveAttribute('href', /google\.com\/maps/);
  });

  test('the forecast can be moved a day at a time without leaving the drawer', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');
    await openFirstSpot(page);

    const tabs = page.getByTestId('drawer-day-tab');
    await expect(tabs.first()).toHaveAttribute('data-active', 'true');

    await tabs.nth(1).click();
    await expect(page.getByTestId('spot-drawer')).toBeVisible();
    await expect(tabs.nth(1)).toHaveAttribute('data-active', 'true');
  });

  test('the hour can be stepped inside the drawer', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('drawer-time')).toHaveText('15:00');
    await page.getByTestId('hour-next').click();
    await expect(page.getByTestId('drawer-time')).toHaveText('16:00');
    await page.getByTestId('hour-prev').click();
    await expect(page.getByTestId('drawer-time')).toHaveText('15:00');
  });

  test('jumping to another day keeps the hour of day', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');
    await openFirstSpot(page);

    await page.getByTestId('hour-next').click();
    await expect(page.getByTestId('drawer-time')).toHaveText('16:00');

    await page.getByTestId('drawer-day-tab').nth(2).click();
    // Comparing a spot across days is only meaningful at the same hour.
    await expect(page.getByTestId('drawer-time')).toHaveText('16:00');
  });

  test('swell and wind carry a direction arrow pointing where they travel', async ({ page }) => {
    await stubForecast(page, { windSpeed: 18, windDirection: 140 });
    await page.goto('/');
    await openFirstSpot(page);

    const arrows = page.getByTestId('direction-arrow');
    await expect(arrows.first()).toBeVisible();

    // Swell comes from 315, so the glyph must point at 135, not 315.
    const swellArrow = arrows.filter({ has: page.locator('[data-from="315"]') }).or(
      page.locator('[data-testid="direction-arrow"][data-from="315"]')
    );
    await expect(swellArrow.first()).toHaveCSS('transform', /matrix/);
  });
});

test.describe('spec: responsive-layout', () => {
  test('the page does not scroll on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubForecast(page);
    await page.goto('/');

    const overflow = await page.evaluate(() => ({
      vertical: document.documentElement.scrollHeight > window.innerHeight + 1,
      horizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));

    expect(overflow.vertical, 'page scrolls vertically').toBe(false);
    expect(overflow.horizontal, 'page scrolls horizontally').toBe(false);
  });

  test('the controls stay on screen on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubForecast(page);
    await page.goto('/');

    await expect(page.getByTestId('region-button')).toBeInViewport();
    for (const id of ['region-button', 'level-button', 'info-button', 'locate-button']) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height, `${id} is a comfortable touch target`).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByLabel('Forecast hour')).toBeInViewport();
  });

  test('the drawer fits the phone viewport with its action visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('go-to-spot')).toBeInViewport();
    await expect(page.getByTestId('spot-score')).toBeInViewport();
  });
});

test.describe('spec: region-selection / El mapa sigue a la región', () => {
  test('switching region flies the map to it', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });

    const centreOf = () =>
      page.evaluate(() => {
        const marker = document.querySelector('[data-testid="spot-marker"]') as HTMLElement | null;
        return marker ? marker.getBoundingClientRect().top : null;
      });

    const before = await centreOf();

    const current = await page.getByTestId('region-button').getAttribute('data-region');
    const other = current === 'Galicia' ? 'Asturias' : 'Galicia';
    await pickRegion(page, other);
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-testid="spot-marker"]').first()).toBeAttached({
      timeout: 45_000,
    });
    // Markers exist for the new region, meaning the map framed it rather than
    // staying put over the old one.
    expect(await centreOf()).not.toBe(before);
  });

  test('switching country switches to one of its regions', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    await page.getByTestId('region-button').click();
    // Country is a dropdown, not a row of chips: the header must not change
    // shape as the catalogue grows past four countries.
    await expect(page.getByTestId('country-list')).toHaveCount(0);
    await page.getByTestId('country-select').click();
    await expect(page.getByTestId('country-list')).toBeVisible();
    await page.locator('[data-testid="country-option"][data-country="France"]').click();
    await expect(page.getByTestId('country-select')).toHaveAttribute('data-country', 'France');
    await expect(page.getByTestId('country-list')).toHaveCount(0);
    const regions = await page.getByTestId('region-option').evaluateAll(n => n.map(x => (x as HTMLElement).dataset.region));
    expect(regions).toContain('Bretagne');
    await page.locator('[data-testid="region-option"][data-region="Bretagne"]').click();

    await expect(page.getByTestId('region-button')).toHaveAttribute('data-region', 'Bretagne');
    await expect(page.getByTestId('region-button')).toHaveAttribute('data-country', 'France');
  });
});

test.describe('spec: map-viewport', () => {
  test('REGRESSION: stepping the hour does not reset the map view', async ({ page }) => {
    // fitBounds used to live in renderMarkers, which re-runs on every hour
    // change, so dragging the timeline yanked a zoomed-in user back out.
    await stubForecast(page);
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForTimeout(1500);

    // Pan rather than zoom: zooming right in empties the viewport of spots,
    // and markers are only rendered for what is on screen.
    const map = page.locator('.mapboxgl-map');
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2 - 60, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1800);

    const panned = await page
      .locator('[data-testid="spot-marker"]')
      .first()
      .evaluate(n => n.getBoundingClientRect().left);

    await page.getByLabel('Forecast hour').fill('3');
    await page.waitForTimeout(2000);

    const afterHourChange = await page
      .locator('[data-testid="spot-marker"]')
      .first()
      .evaluate(n => n.getBoundingClientRect().left);

    // The pan survives; a refit would snap the view back and move the marker.
    expect(Math.abs(afterHourChange - panned)).toBeLessThan(40);
  });

  test('REGRESSION: the scoring indicator clears once scoring finishes', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });

    await expect(page.getByTestId('scoring-indicator')).toHaveCount(0, { timeout: 30_000 });
  });
});

test.describe('spec: drawer-navigation / Límites de la navegación', () => {
  test('the active day tab always matches the day shown', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') }); // anchor 15:00
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');
    await openFirstSpot(page);

    // Walk to a later day, then step back to an early hour that does not exist
    // today, then ask for Today. The tab shown must be the tab that is active.
    await page.getByTestId('drawer-day-tab').nth(3).click();
    for (let i = 0; i < 6; i++) await page.getByTestId('hour-prev').click();

    await page.getByTestId('drawer-day-tab').first().click();
    await expect(page.getByTestId('drawer-day-tab').first()).toHaveAttribute('data-active', 'true');
  });

  test('the earliest reachable hour of today is the anchor hour', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-16T12:20:00Z') });
    await stubForecast(page, { now: (new Date('2026-09-16T12:20:00Z')).valueOf() });
    await page.goto('/');
    await openFirstSpot(page);

    await page.getByTestId('drawer-day-tab').nth(2).click();
    await page.getByTestId('drawer-day-tab').first().click();

    // Never earlier than 15:00: the hours before it are in the past.
    const shown = await page.getByTestId('drawer-time').textContent();
    expect(Number.parseInt(shown!.slice(0, 2), 10)).toBeGreaterThanOrEqual(15);
  });
});

test.describe('spec: surf-rating / Detalle', () => {
  test('the drawer shows wave energy and breaking height', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('energy')).toHaveText(/820 kJ/);
    await expect(page.getByTestId('breaking-height')).toContainText('1.9m');
  });

  test('wind-ruined surf shows no potential line: the verdict and the badge explain it', async ({ page }) => {
    await stubForecast(page, { stars: 2, swellStars: 7, windSpeed: 22, windDirection: 320 });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('spot-quality')).toBeVisible();
    await expect(page.getByTestId('spot-potential')).toHaveCount(0);
    await expect(page.getByTestId('spot-verdict')).toContainText('onshore');
    await expect(page.getByTestId('wind-badge')).toHaveText('Onshore');
  });

  test('clean surf shows no potential line', async ({ page }) => {
    await stubForecast(page, { stars: 7, swellStars: 7 });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('spot-quality')).toBeVisible();
    await expect(page.getByTestId('spot-potential')).toHaveCount(0);
  });
});

test.describe('spec: data-transparency', () => {
  const NOW = new Date('2026-09-17T12:00:00Z').getTime();

  async function stubDataStatus(page: Page, fail = false) {
    await page.route('**/api/data-status', route =>
      fail
        ? route.fulfill({ status: 500, body: 'error' })
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              generatedAt: NOW,
              forecastCacheSeconds: 3600,
              models: [
                {
                  id: 'ecmwf_wam', host: 'marine', role: 'waves', name: 'ECMWF WAM', provider: 'ECMWF',
                  resolution: '9 km', coverage: 'Global', status: 'ok',
                  lastRunInitialisedAt: NOW - 6 * 3_600_000, lastRunAvailableAt: NOW - 3 * 3_600_000,
                  updateIntervalSeconds: 21_600, nextExpectedAt: NOW + (2 * 60 + 5) * 60_000,
                },
                {
                  id: 'dwd_ewam', host: 'marine', role: 'waves', name: 'EWAM', provider: 'DWD',
                  resolution: '5 km', coverage: 'Europe', status: 'unavailable',
                  lastRunInitialisedAt: null, lastRunAvailableAt: null, updateIntervalSeconds: null, nextExpectedAt: null,
                },
                {
                  id: 'dwd_icon', host: 'weather', role: 'wind', name: 'ICON', provider: 'DWD',
                  resolution: '11 km', coverage: 'Global', status: 'ok',
                  lastRunInitialisedAt: NOW - 5 * 3_600_000, lastRunAvailableAt: NOW - 4 * 3_600_000,
                  updateIntervalSeconds: 10_800, nextExpectedAt: NOW - 30 * 60_000,
                },
              ],
            }),
          })
    );
  }

  test('the info button opens a panel with sources, freshness and rating logic', async ({ page }) => {
    await page.clock.install({ time: NOW });
    await stubForecast(page, { now: NOW });
    await stubDataStatus(page);
    await page.goto('/');

    await page.getByTestId('info-button').click();
    const panel = page.getByTestId('info-panel');
    await expect(panel).toBeVisible();

    await expect(page.getByTestId('info-sources')).toContainText('Open-Meteo Marine API');
    await expect(page.locator('[data-model="ecmwf_wam"]')).toContainText('9 km');
    await expect(page.locator('[data-model="ecmwf_wam"] [data-testid="model-next-update"]')).toHaveText('in 2h 5m');
    await expect(page.locator('[data-model="ecmwf_wam"] [data-testid="model-last-run"]')).toHaveText('ran 3h ago');
    await expect(page.getByTestId('info-cache-duration')).toHaveText('60 minutes');
    await expect(page.getByTestId('info-calibration')).toContainText('1.4 m at 10 s');
    await expect(page.getByTestId('info-calibration')).toContainText('7');
    await expect(page.getByTestId('info-limitations')).toContainText('tide');
    await expect(page.getByTestId('info-next')).toContainText('models');
  });

  test('an overdue model says due now and a missing one says unavailable', async ({ page }) => {
    await page.clock.install({ time: NOW });
    await stubForecast(page, { now: NOW });
    await stubDataStatus(page);
    await page.goto('/');
    await page.getByTestId('info-button').click();

    await expect(page.locator('[data-model="dwd_icon"] [data-testid="model-next-update"]')).toHaveText('Due now');
    await expect(page.locator('[data-model="dwd_ewam"] [data-testid="model-next-update"]')).toHaveText('Status unavailable');
  });

  test('the rating section explains the wind the way it is scored', async ({ page }) => {
    await stubForecast(page);
    await stubDataStatus(page);
    await page.goto('/');
    await page.getByTestId('info-button').click();

    const rating = page.getByTestId('info-rating');
    await expect(rating).toContainText('gusts do not count');
    await expect(rating).toContainText('Under 10 km/h');
    await expect(rating).not.toContainText(/calibrat/i);
    await expect(rating).not.toContainText('swell alone');

    // Both basins' anchors, each with the score it gets.
    await expect(page.getByTestId('info-calibration')).toContainText('1.4 m at 10 s 7');
    await expect(rating).toContainText('Mediterranean');
    await expect(rating).toContainText('1.5 m at 8 s 6');
  });

  test('when the status endpoint fails the panel says so', async ({ page }) => {
    await stubForecast(page);
    await stubDataStatus(page, true);
    await page.goto('/');
    await page.getByTestId('info-button').click();

    await expect(page.getByTestId('info-status-failed')).toBeVisible();
    await expect(page.getByTestId('info-rating')).toBeVisible();
  });

  test('closing the panel keeps the selected region and hour', async ({ page }) => {
    await page.clock.install({ time: NOW });
    await stubForecast(page, { now: NOW });
    await stubDataStatus(page);
    await page.goto('/');

    const region = await page.getByTestId('region-button').getAttribute('data-region');
    await page.getByLabel('Forecast hour').fill('5');
    const time = await page.getByTestId('forecast-time').textContent();

    await page.getByTestId('info-button').click();
    await expect(page.getByTestId('info-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('info-panel')).toHaveCount(0);

    await expect(page.getByTestId('region-button')).toHaveAttribute('data-region', region!);
    await expect(page.getByTestId('forecast-time')).toHaveText(time!);
  });

  test('on a phone the panel fits and scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubForecast(page);
    await stubDataStatus(page);
    await page.goto('/');

    await expect(page.getByTestId('info-button')).toBeInViewport();
    await page.getByTestId('info-button').click();
    const panel = page.getByTestId('info-panel');
    await expect(panel).toBeVisible();

    const box = (await panel.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(844);
    await page.getByTestId('info-next').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('info-next')).toBeInViewport();
  });
});


test.describe('spec: region-selection / Todos los spots visibles puntuados', () => {
  test('a large region is fully scored, with no unrated markers', async ({ page }) => {
    await stubForecast(page, { stars: 3 });
    await page.goto('/');
    await pickRegion(page, 'Cataluña');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForTimeout(3000);

    const tiers = await page
      .locator('[data-testid="spot-marker"]')
      .evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.tier));
    // The old per-viewport cap left most of Catalonia hollow for good, so the
    // check is against the region's real size rather than a fixed number: the
    // curated catalogue is far smaller than the tagged-beach one it replaced.
    const inRegion = spotIndex.filter(s => s.community === 'Cataluña').length;
    expect(inRegion).toBeGreaterThan(20);
    expect(tiers.length).toBeGreaterThan(inRegion / 2);
    expect(tiers.filter(t => t === 'unrated')).toHaveLength(0);
  });

  test('a spot without data is not drawn at all', async ({ page }) => {
    await stubForecast(page, { stars: 3 });
    // Override: every other spot in each chunk has no data.
    await page.route('**/api/forecast/batch*', async route => {
      const url = new URL(route.request().url());
      const region = url.searchParams.get('region') ?? '';
      const chunk = Number(url.searchParams.get('chunk') ?? 0);
      const members = regionOrder(spotIndex, region).slice(chunk * 50, (chunk + 1) * 50);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          region,
          chunk,
          start: new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toISOString().slice(0, 13) + ':00',
          results: members.map((m, i) => {
            const has = i % 2 === 0;
            const fill = (v: number) => Array.from({ length: 169 }, () => (has ? v : -1));
            return { id: m.id, hasData: has, stars: fill(3), swellStars: fill(3), height: fill(15), period: fill(9), danger: [] };
          }),
        }),
      });
    });
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForTimeout(2500);

    const region = (await page.getByTestId('region-button').getAttribute('data-region'))!;
    const withoutData = new Set(
      regionOrder(spotIndex, region).filter((_, i) => i % 50 % 2 !== 0).map(s => s.id)
    );
    const drawn = await page
      .locator('[data-testid="spot-marker"]')
      .evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.spotId));
    expect(drawn.length).toBeGreaterThan(0);
    for (const id of drawn) expect(withoutData.has(id!), `${id} has no data but is drawn`).toBe(false);
  });
});

test.describe('spec: drawer-navigation / Línea temporal de pills', () => {
  const CLOCK = new Date('2026-09-16T12:20:00Z').getTime(); // anchor 15:00 Madrid

  test('a better day ahead shows up in the pills without navigating', async ({ page }) => {
    await page.clock.install({ time: CLOCK });
    // Flat until offset 57 (Saturday 00:00 local), then a 5.
    await stubForecast(page, { now: CLOCK, starsAt: h => (h >= 57 ? 5 : 0) });
    await page.goto('/');
    await openFirstSpot(page);

    const pills = page.getByTestId('timeline-pill');
    await expect(pills.first()).toBeVisible();
    expect(await pills.count()).toBeGreaterThan(50);

    const colourOf = (offset: number) =>
      page
        .locator(`[data-testid="timeline-pill"][data-hour-offset="${offset}"] span`)
        .evaluate(n => getComputedStyle(n).backgroundColor);
    expect(await colourOf(0)).toBe('rgb(82, 82, 91)');
    expect(await colourOf(57)).toBe('rgb(251, 191, 36)');
  });

  test('tapping a pill opens that slot and marks it', async ({ page }) => {
    await page.clock.install({ time: CLOCK });
    await stubForecast(page, { now: CLOCK });
    await page.goto('/');
    await openFirstSpot(page);

    // Tomorrow's 06:00 slot: 15:00 today + 15 hours.
    const pill = page.locator('[data-testid="timeline-pill"][data-hour-offset="15"]');
    await pill.click();
    await expect(page.getByTestId('drawer-time')).toHaveText('06:00');
    await expect(page.getByTestId('drawer-day-label')).toHaveText('Tomorrow');
    await expect(pill).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('drawer-day-tab').nth(1)).toHaveAttribute('data-active', 'true');
  });

  test('on a 375 px phone at least three days of pills fit on screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.clock.install({ time: CLOCK });
    await stubForecast(page, { now: CLOCK });
    await page.goto('/');
    await openFirstSpot(page);

    const timeline = page.getByTestId('forecast-timeline');
    await expect(timeline).toBeVisible();
    const frame = (await timeline.boundingBox())!;
    const days = await page.getByTestId('timeline-day').evaluateAll(nodes =>
      nodes.map(n => n.getBoundingClientRect().right)
    );
    const fullyVisible = days.filter(right => right <= frame.x + frame.width + 1);
    // Today is partial (from 15:00), so three full days means at least four groups.
    expect(fullyVisible.length).toBeGreaterThanOrEqual(3);
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(375);
  });

  test('changing the hour does not fetch the forecast again', async ({ page }) => {
    await page.clock.install({ time: CLOCK });
    await stubForecast(page, { now: CLOCK });
    let requests = 0;
    page.on('request', r => {
      if (r.url().includes('/api/forecast/series')) requests++;
    });
    await page.goto('/');
    await openFirstSpot(page);
    await expect(page.getByTestId('swell-height')).toContainText('m');

    await page.getByTestId('hour-next').click();
    await page.getByTestId('hour-next').click();
    await page.getByTestId('drawer-day-tab').nth(2).click();
    await expect(page.getByTestId('drawer-time')).toHaveText('17:00');
    expect(requests).toBe(1);
  });
});

test.describe('spec: drawer-navigation / Abrir un spot empieza por hoy', () => {
  test('opening a spot resets the forecast to the first hour of today', async ({ page }) => {
    const CLOCK = new Date('2026-09-16T12:20:00Z').getTime();
    await page.clock.install({ time: CLOCK });
    await stubForecast(page, { now: CLOCK });
    await page.goto('/');

    await page.getByLabel('Forecast hour').fill('50');
    await expect(page.getByTestId('forecast-time')).not.toContainText('Today');

    await openFirstSpot(page);
    await expect(page.getByTestId('drawer-day-label')).toHaveText('Today');
    await expect(page.getByTestId('drawer-time')).toHaveText('15:00');
    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 15:00');
  });
});

test.describe('spec: drawer-navigation / Carga fiable del detalle', () => {
  test('a transient failure is retried without the user doing anything', async ({ page }) => {
    await stubForecast(page, { seriesFailures: [502] });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('forecast-loading')).toBeVisible();
    await expect(page.getByTestId('swell-height')).toContainText('1.5 m', { timeout: 15_000 });
    await expect(page.getByTestId('forecast-error')).toHaveCount(0);
  });

  test('a persistent failure keeps trying for about a minute, then says so and can be retried', async ({ page }) => {
    const CLOCK = new Date('2026-09-16T12:20:00Z').getTime();
    await page.clock.install({ time: CLOCK });
    // The first attempt and all five retries fail; the manual retry succeeds.
    await stubForecast(page, { now: CLOCK, seriesFailures: [429, 429, 502, 429, 429, 502] });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('forecast-retrying')).toBeVisible();
    // The upstream quota is per minute, so the app must not give up before it resets.
    // Each retry waits on a real (stubbed) request before its next timer exists,
    // so fake time is advanced one wait at a time.
    const advance = async (ms: number) => {
      await page.waitForTimeout(400);
      await page.clock.runFor(ms);
    };
    await advance(2_000);
    await advance(5_000);
    await advance(10_000);
    await expect(page.getByTestId('forecast-error')).toHaveCount(0);
    await advance(20_000);
    await advance(30_000);
    await expect(page.getByTestId('forecast-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('swell-height')).toHaveText('—');

    await page.getByTestId('forecast-retry').click();
    await expect(page.getByTestId('swell-height')).toContainText('1.5 m', { timeout: 10_000 });
    await expect(page.getByTestId('forecast-error')).toHaveCount(0);
  });
});

test.describe('spec: data-transparency / Panel fácil de leer', () => {
  test('quick links take you to each section', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubForecast(page);
    await page.goto('/');
    await page.getByTestId('info-button').click();

    const first = page.getByTestId('info-scroll').locator('section').first();
    await expect(first).toHaveAttribute('data-testid', 'quality-legend');
    await expect(page.getByTestId('legend-epic')).toBeInViewport();

    await page.getByTestId('info-link-safety').click();
    await expect(page.getByTestId('info-safety')).toBeInViewport();
    await page.getByTestId('info-link-conditions').click();
    await expect(page.getByTestId('quality-legend')).toBeInViewport();
  });
});

test.describe('spec: responsive-layout / ui-refresh', () => {
  test('no text on the map screen or in the detail is smaller than 12 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);
    await expect(page.getByTestId('swell-height')).toContainText('m');

    const tooSmall = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const el = node.parentElement;
        if (!el || !node.textContent?.trim()) continue;
        if (el.closest('.mapboxgl-ctrl, .sr-only, [hidden]')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const size = Number.parseFloat(style.fontSize);
        if (size < 12) out.push(`${size}px "${node.textContent.trim().slice(0, 30)}"`);
      }
      return out;
    });
    expect(tooSmall).toEqual([]);
  });
});

test.describe('spec: region-selection / Selector de región', () => {
  test('searching finds a region in another country and choosing it switches both', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    await page.getByTestId('region-button').click();
    await page.getByTestId('region-search').fill('cornw');
    const options = page.getByTestId('region-option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Cornwall');
    await options.first().click();

    await expect(page.getByTestId('region-button')).toHaveAttribute('data-region', 'Cornwall');
    await expect(page.getByTestId('region-button')).toHaveAttribute('data-country', 'United Kingdom');
  });

  test('the current region is marked in the list', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await pickRegion(page, 'Galicia');

    await page.getByTestId('region-button').click();
    await expect(page.locator('[data-testid="region-option"][data-region="Galicia"]')).toHaveAttribute('aria-current', 'true');
  });

  test('the level picker explains that level only changes alerts', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await page.getByTestId('level-button').click();
    await expect(page.getByTestId('level-picker')).toContainText('Scores are the same for everyone');
    await page.getByTestId('level-expert').click();
    await expect(page.getByTestId('level-button')).toHaveAttribute('data-level', 'expert');
  });
});

test.describe('spec: region-selection / Mejores spots a la vista', () => {
  const CLOCK = new Date('2026-09-16T12:20:00Z').getTime();

  test('the best spots in view are listed and open at the hour they were ranked for', async ({ page }) => {
    await page.clock.install({ time: CLOCK });
    await stubForecast(page, { now: CLOCK, starsAt: h => (h >= 57 ? 7 : 1) });
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });

    await page.getByLabel('Forecast hour').fill('60');
    const best = page.getByTestId('best-spot');
    await expect(best.first()).toBeVisible();
    await expect(best.first()).toContainText('7');
    expect(await best.count()).toBeLessThanOrEqual(3);

    const time = await page.getByTestId('forecast-time').textContent();
    await best.first().click();
    await expect(page.getByTestId('spot-drawer')).toBeVisible();
    await expect(page.getByTestId('forecast-time')).toHaveText(time!);
  });

  test('with nothing surfable in view the section is dropped, not shown empty', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubForecast(page, { stars: 1 });
    await page.goto('/');
    await expect(page.getByTestId('best-spot').first()).toBeVisible({ timeout: 45_000 });
    const withBest = (await page.getByLabel('Forecast controls').boundingBox())!.height;

    await stubForecast(page, { stars: 0 });
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForTimeout(2000);

    await expect(page.getByTestId('best-in-view')).toHaveCount(0);
    const flat = (await page.getByLabel('Forecast controls').boundingBox())!.height;
    expect(flat).toBeLessThan(withBest);
  });

  test('a focused field is 16 px, so iOS does not zoom the page in', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await page.getByTestId('region-button').click();

    const search = page.getByTestId('region-search');
    await search.click();
    const size = await search.evaluate(n => Number.parseFloat(getComputedStyle(n).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test('each day shows its best score, so the good day stands out', async ({ page }) => {
    await page.clock.install({ time: CLOCK });
    // Wed 15:00 anchor: offset 57 is Saturday 00:00 in Madrid. Saturday scores 7, the rest 0.
    await stubForecast(page, { now: CLOCK, starsAt: h => (h >= 57 && h < 81 ? 7 : 0) });
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });

    const chips = page.getByTestId('day-chip');
    await expect(chips.nth(3)).toHaveAttribute('data-best', '7');
    await expect(chips.first()).toHaveAttribute('data-best', '0');
  });

  test('moving the time slider does not request the map again', async ({ page }) => {
    await stubForecast(page);
    let batches = 0;
    page.on('request', r => {
      if (r.url().includes('/api/forecast/batch')) batches++;
    });
    await page.goto('/');
    await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });
    await expect(page.getByTestId('scoring-indicator')).toHaveCount(0, { timeout: 30_000 });
    const before = batches;

    for (const hour of ['10', '40', '100', '150']) {
      await page.getByLabel('Forecast hour').fill(hour);
      await page.waitForTimeout(300);
    }
    await expect(page.locator('[data-testid="spot-marker"]').first()).toBeAttached();
    expect(batches).toBe(before);
  });

  test('back to now returns to the first hour', async ({ page }) => {
    const CLOCK2 = CLOCK;
    await page.clock.install({ time: CLOCK2 });
    await stubForecast(page, { now: CLOCK2 });
    await page.goto('/');
    await expect(page.getByTestId('back-to-now')).toHaveCount(0);
    await page.getByLabel('Forecast hour').fill('30');
    await page.getByTestId('back-to-now').click();
    await expect(page.getByTestId('forecast-time')).toHaveText('Today, 15:00');
  });
});

test.describe('spec: drawer-navigation / Veredicto, marea y detalles', () => {
  const CLOCK = new Date('2026-09-16T12:20:00Z').getTime();

  test('the detail summarises the hour, shows the best window and the tide trend', async ({ page }) => {
    await page.clock.install({ time: CLOCK });
    await stubForecast(page, { now: CLOCK, starsAt: h => (h >= 2 && h < 5 ? 3 : 1) });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('spot-verdict')).toContainText('1.5 m groundswell at 12 s');
    await expect(page.getByTestId('best-window')).toContainText('17:00–20:00');
    // 15:00 shown; the stubbed tides put the next extreme at 15:00 high then 21:00 low.
    await expect(page.getByTestId('tide-trend')).toContainText('low 21:00');
  });

  test('sea state details are folded until asked for', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');
    await openFirstSpot(page);

    const toggle = page.getByTestId('sea-state-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('breaking-height')).toBeHidden();
    await toggle.click();
    await expect(page.getByTestId('breaking-height')).toBeVisible();
    await expect(page.getByTestId('go-to-spot')).toContainText('Directions');
  });
});

test.describe("spec: responsive-layout / Mapbox's own credits", () => {
  // Mapbox's terms require the logo and the attribution to stay visible, so the
  // app's job is to keep its own chrome off them rather than hide them.
  for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1280, 900]] as const) {
    test(`the logo and credits are visible and clear of the sheet on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await stubForecast(page);
      await page.goto('/');
      await page.locator('[data-testid="spot-marker"]').first().waitFor({ state: 'attached', timeout: 45_000 });
      await page.waitForTimeout(1500);

      const logo = page.locator('.mapboxgl-ctrl-logo');
      const credits = page.locator('.mapboxgl-ctrl-attrib');
      await expect(logo).toBeVisible();
      await expect(credits).toBeVisible();

      const sheet = (await page.getByTestId('forecast-sheet').boundingBox())!;
      for (const box of [(await logo.boundingBox())!, (await credits.boundingBox())!]) {
        // Clear of the sheet: above it, or beside it where the sheet is narrower
        // than the window. And on screen either way.
        const above = box.y + box.height <= sheet.y + 1;
        const beside = box.x + box.width <= sheet.x + 1 || box.x >= sheet.x + sheet.width - 1;
        expect(above || beside, 'the sheet covers the credits').toBe(true);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        expect(box.x).toBeGreaterThanOrEqual(0);
      }

      // One row in the corner, not a stack: same band, logo first.
      const logoBox = (await logo.boundingBox())!;
      const creditsBox = (await credits.boundingBox())!;
      expect(Math.abs(logoBox.y - creditsBox.y)).toBeLessThan(logoBox.height);
      expect(creditsBox.x).toBeGreaterThan(logoBox.x);
    });
  }
});
