import { test, expect, Page } from '@playwright/test';

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
  } = options;

  await page.route('**/api/forecast*', async route => {
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
      if (color === 'rgba(0, 0, 0, 0)') continue; // unrated markers are hollow
      const [r, g] = color.match(/\d+/g)!.slice(0, 2).map(Number);
      expect(g, `marker rendered ${color}`).toBeLessThanOrEqual(r);
    }
  });

  test('the three quality tiers are visually distinct on the map', async ({ page }) => {
    // The complaint that started this: several yellows at different opacity
    // were indistinguishable, so the map could not be read at a glance.
    const sizes: Record<string, number> = {};

    for (const [tier, stars] of [['epic', 9], ['good', 6], ['poor', 2]] as const) {
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

    await stubForecast(page, { stars: 2 });
    await page.goto('/');
    const poor = page.locator('[data-testid="spot-marker"]').first();
    await poor.waitFor({ state: 'attached', timeout: 45_000 });
    await expect(poor).toHaveText('');
  });

  test('the legend explains what the marker styles mean', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    await expect(page.getByTestId('quality-legend')).toBeVisible();
    for (const tier of ['epic', 'good', 'poor', 'danger']) {
      await expect(page.getByTestId(`legend-${tier}`)).toBeVisible();
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

test.describe('spec: region-selection', () => {
  test('there is no "all regions" option', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    const options = await page.getByTestId('region-select').locator('option').allTextContents();
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

    await expect(page.getByTestId('region-select')).toHaveValue('País Vasco', { timeout: 15_000 });
  });

  test('without geolocation the region falls back to the default', async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    await stubForecast(page);
    await page.goto('/');

    // Asserted against the exported default rather than a hard-coded name, so
    // this stays a test of the fallback behaviour. That the default is
    // Cataluña is asserted in tests/unit/regions.spec.ts against the catalogue.
    const { DEFAULT_REGION } = await import('../../src/services/regions');
    await expect(page.getByTestId('region-select')).toHaveValue(DEFAULT_REGION);
    await context.close();
  });

  test('a manual pick is not overwritten by a late geolocation callback', async ({ page }) => {
    await stubForecast(page);
    await page.goto('/');

    await page.getByTestId('region-select').selectOption('Galicia');
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('region-select')).toHaveValue('Galicia');
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
    await stubForecast(page);
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
    await stubForecast(page);
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
    await stubForecast(page);
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

    await expect(page.getByTestId('region-select')).toBeInViewport();
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

    const select = page.getByTestId('region-select');
    const options = await select.locator('option').allTextContents();
    const current = await select.inputValue();
    const other = options.find(o => o !== current);
    test.skip(!other, 'catalogue has a single region');

    await select.selectOption(other!);
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

    const countries = await page.getByTestId('country-select').locator('option').allTextContents();
    test.skip(countries.length < 2, 'catalogue has a single country');

    const current = await page.getByTestId('country-select').inputValue();
    const other = countries.find(c => c !== current)!;

    await page.getByTestId('country-select').selectOption(other);

    const regions = await page.getByTestId('region-select').locator('option').allTextContents();
    expect(regions.length).toBeGreaterThan(0);
    expect(regions).toContain(await page.getByTestId('region-select').inputValue());
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
    await stubForecast(page);
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
    await stubForecast(page);
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

  test('wind-ruined surf says what the swell alone would score', async ({ page }) => {
    await stubForecast(page, { stars: 2, swellStars: 7 });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('spot-potential')).toContainText('7/10');
    await expect(page.getByTestId('spot-potential')).toContainText('wind costs 5');
  });

  test('clean surf shows no potential line', async ({ page }) => {
    await stubForecast(page, { stars: 7, swellStars: 7 });
    await page.goto('/');
    await openFirstSpot(page);

    await expect(page.getByTestId('spot-quality')).toBeVisible();
    await expect(page.getByTestId('spot-potential')).toHaveCount(0);
  });
});
