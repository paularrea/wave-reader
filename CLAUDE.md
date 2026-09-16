# Wave Reader Development Guide

## Project Overview
A mobile-first responsive web app for surfers to find the best surf spots based on real-time marine data.

## Tech Stack
- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **UI**: Mapbox GL JS, Vaul (drawers), lucide-react
- **State**: Zustand
- **Data**: Open-Meteo (marine + weather), OpenStreetMap Nominatim (catalogue generation only)
- **Node**: >= 20.9 (pinned in `.nvmrc`)

## Data sources — read before touching `marine-api.ts`

Open-Meteo splits what a surf forecast needs across **two hosts**:

| Magnitude | Host | Notes |
|---|---|---|
| Waves, swell, secondary swell, wind waves, `sea_level_height_msl` | `marine-api.open-meteo.com/v1/marine` | |
| `wind_speed_10m`, `wind_direction_10m` | `api.open-meteo.com/v1/forecast` | **Not available on the marine host** |

The marine host *accepts* `wind_speed_10m` as a parameter and answers with a column of
nulls (`"wind_speed_10m": "undefined"` in `hourly_units`). Asking it for wind is the
bug this codebase was built to stop repeating.

- **Units**: wind arrives in **km/h already**. Do not convert. A `* 1.852` "knots to km/h"
  step once corrupted every reading, and because `null * 1.852 === 0`, it reported a
  flat calm at every spot instead of failing loudly.
- **Missing data**: every optional magnitude is typed `number | null`. Nothing between
  the service layer and the UI may apply `?? 0`.
- **Timezone**: both hosts are called with `timezone=auto`, so their hourly series are
  already in the spot's local time. The two are joined **by timestamp, never by array
  index** — if one host trims its horizon, index-joining shifts every reading silently.

## Core Logic

### Star Engine (`src/services/star-engine.ts`)
Returns a 0-10 rating plus a safety verdict.
1. **Unrated**: missing swell height or direction returns `unrated: true`, not 0 stars.
2. **Swell window**: direction outside the spot's window -> 0 stars (safety still evaluated).
3. **Height match**: 10 points inside the level's range; -5 points per metre of deviation.
4. **Wind**: offshore within tolerance x1.2; onshore x0.6; unknown wind leaves the score alone.
5. **Period bonus**: +1 over 10s, +1 more over 14s.
6. **Safety**: `beginner` above `idealHeight.beginner.max` triggers a red alert whose
   message names the forecast height, the spot's ceiling and why it is dangerous.

### Conditions (`src/services/conditions.ts`)
Single source of truth for colour. Both the map markers and the drawer read from here.
- **Quality**: one yellow hue (`250, 204, 21`), opacity ramping 0.15 -> 1.0 with the score.
  **No green anywhere on the quality scale.** Dangerous spots override to red `#EF4444`;
  unrated spots are grey.
- **Wind badges**: `Glass` < 5 km/h (green), `Off-shore` (green), `Cross-shore` (light green),
  `On-shore` (grey). Returns `null` when wind is unknown — a missing reading must never
  fall through to `Glass`.
- **Swell gradient**: light blue (small) -> dark blue (heavy).

### Tides (`src/services/tides.ts`)
Open-Meteo has no tide-extremes endpoint, so highs and lows are the local maxima and
minima of the hourly `sea_level_height_msl` series, filtered to a minimum 10 cm
prominence so model noise is not reported as a tide. Resolution is hourly, so times are
accurate to about +/- 30 min — the UI says so.

### Timeline (`src/services/timeline.ts`)
- Anchors at the current time **rounded up** to the next whole hour in the spot's timezone.
- Advances in exact 1-hour steps up to 168 h.
- Labels render in the spot's `utc_offset_seconds`, never the browser's.
- Days are labelled `Today` / `Tomorrow` / `Sat 19 Sept`, with a chip strip for jumping.
- All time-dependent UI renders only after mount; rendering it during SSR causes a
  hydration mismatch (React #418) because the server cannot know the viewer's "now".

## Spot catalogue

`src/data/spots.json` is **generated, not hand-edited**:

```bash
npm run build:catalog
```

`scripts/build-spot-catalog.mjs` resolves each name in `src/data/spots.seed.json` against
OpenStreetMap Nominatim, keeps only `natural/beach|bay|reef` features whose
`address.state` matches the seed's community, and validates the coordinate sits in the
coastal elevation band `0 < elevation < 100 m`. Anything unverifiable is dropped and
recorded in `src/data/spots.catalog-report.json` with its reason.

Run it manually — Nominatim allows 1 req/s and forbids heavy automated use, so the build
must never depend on it. The output is committed to keep Vercel builds hermetic.

## Verification

```bash
npm run test:unit   # timeline maths, tide detection, colour rules, catalogue integrity
npm run test:e2e    # browser flows against the production build
npm test            # unit + e2e (no network beyond the local server)
npm run test:prod   # smoke test against the live deployment; hits real APIs
```

E2E runs against `next build && next start`, not the dev server: that is what Vercel
serves, and the dev server's HMR channel does not hydrate reliably under Playwright.
