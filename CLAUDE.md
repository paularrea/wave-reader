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
Rates **the surf, not how well it suits the viewer** — the way surf-forecast,
Magicseaweed and Surfline all rate. Skill level only drives the safety alert; never
reintroduce it into `stars`.

**Two energy scales, by basin** (`src/services/basins.ts`, from coordinates): the
Mediterranean never sees the long swells that score on an Atlantic scale, so it has its
own, anchored to local expertise — 1 m @ 7 s clean is 2–3, 1.5 m @ 8 s glassy 5–6
(flat under 5 kJ, 10 at 1,500 kJ, gamma 1.6, period ×0.6 under 5 s, ×0.85 under 6 s).
Wind handling is shared across basins. Everything else uses the Atlantic scale below.
The basin rule would need revisiting before adding Italy or the Adriatic.

**The Atlantic scale is calibrated to surf-forecast.** None of the services publishes a formula
(Surfline's is a model trained on 35 years of private observations), so the structure
follows what they publish and the constants are fitted to surf-forecast's real output:
206 time slots at 10 spots, leave-one-spot-out validation, mean error 0.50 stars, 96%
within one star (the previous hand-picked constants: 2.77 and 15%). Do not hand-tune
the constants: refit with `node scripts/calibrate-rating.mjs` from the benchmark data
in `.cache/benchmark/` (not versioned, third-party data collected by reading public
pages; do not automate recurring extraction). Research and benchmark:
`openspec/changes/archive/*-calibrate-rating-to-surf-forecast/design.md`.

On this scale a clean 1.5 m @ 12 s is ~3, 2.5 m @ 14 s ~5, 4 m @ 18 s ~8. Scores of 5+
are rare: in the benchmark only the best spot in the world per time slot reached them.

1. **Energy** per component (primary swell, secondary swell, wind waves):
   `kJ = 1.9 · H² · T²` (surf-forecast's scale). Each weighted by direction against the
   spot's swell window (×1 inside, fading to ×0.1 at 45° beyond the edge).
2. **Base**: `10 · r^1.41`, `r = ln(E/51.27) / ln(31764/51.27)` clamped to [0,1]. Under
   51 kJ is flat → 0. Monotonic: no closeout penalty, surf-forecast has none.
3. **Period**: ×0.48 under 6 s, ×0.69 under 8 s, ×0.71 under 10 s.
4. **Wind**: effective speed `max(mean, gust / 1.77)` — 1.77 is the median coastal
   gust ratio measured in Open-Meteo, so normal gustiness keeps the calibration and only
   unusually gusty hours lose more (Magicseaweed: gusts matter more than the mean).
   With the spot facing `F = offshoreWindAngle + 180`:
   `factor = 1 − onshore/19.28 − cross/30.1`, no effect under 7.08 km/h, and above
   45 km/h also fading to 0 at 75 km/h from any direction.
5. **`swellStars`** is the score without wind (the "faded stars"); `stars` never exceeds it.
6. **Unrated**: no component with both height and period → `unrated: true`, not 0.
7. **Safety** uses breaking height (Komar–Gaughan, `Hb = 0.39·g^0.2·(T·H²)^0.4`), not
   deep-water height. Beginners are alerted above `max(idealHeight.beginner.max, 1.5 m)`.

### Conditions (`src/services/conditions.ts`)
Single source of truth for colour. Both the map markers and the drawer read from here.
- **Quality tiers** on the surf-forecast scale: `epic` (5-10), `good` (1-4), `poor` (0),
  plus `danger` and
  `unrated`. Each tier differs in **fill, size, ring and glow at once** — not opacity
  alone. A single hue ramped only by alpha is unreadable on a dark map: 4 stars and 7
  stars differ by a few percent of alpha against near-black, below what the eye resolves
  at 20px. Epic and good print their score on the marker; poor stays a plain dot.
  **No green anywhere on the quality scale.** Dangerous spots override to red `#EF4444`
  whatever they score; unrated markers are hollow so "no forecast" never reads as
  "bad forecast".
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
- Opening a spot resets the hour to 0 (`setSelectedSpot`), so the detail always starts at today.

### Spot detail (`SpotDetailDrawer`, `ForecastTimeline`, `useSpotSeries`)
- Loads `/api/forecast/series` **once per spot and level**: every hour of the horizon, rated
  server-side, with tides per local day. Moving between hours never refetches. The old
  per-hour fetch dropped errors silently, which is why the drawer sometimes stayed blank
  after a 429.
- Failures retry after 1.5 s, 4 s and 8 s, then show `forecast-error` with a retry button.
  Results are cached in the session for 30 minutes.
- The pill timeline (`src/services/forecast-series.ts`): one pill per 3-hour local slot,
  represented by — and opening — its first available hour. Height is primary swell,
  0–3 m capped; colour interpolates zinc-600 to the epic yellow by `min(stars,5)/5`, red
  when dangerous, hollow when unrated. 12 px per pill keeps 3+ days on a 375 px phone.
- All time-dependent UI renders only after mount; rendering it during SSR causes a
  hydration mismatch (React #418) because the server cannot know the viewer's "now".

## Spot catalogue

`src/data/spots.json` is **generated, not hand-edited**. Two stages, run manually; the
output is committed so the Vercel build stays hermetic and offline.

```bash
node scripts/fetch-osm-beaches.mjs        # stage 1: OSM -> osm-beaches.raw.json
node scripts/derive-spot-config.mjs       # stage 2: exposure -> spots.json + index
node scripts/filter-spots-with-data.mjs   # stage 3: drop spots the wave model has no data for
```

Coverage: Spain, Ireland, France (incl. overseas régions) and the United Kingdom.
England is fetched once and split by ceremonial county with batched Overpass
`is_in(lat,lon)` lookups (nearest resolved beach for centroids on the waterline).
Only **named** `natural=beach` features are used, so counties whose beaches are mapped
unnamed in OSM (Norfolk, Suffolk, Northumberland) are thin — a data limit, not a bug.

**Stage 1** pulls every named shore feature per region from Overpass, keyed by
**ISO 3166-2 code, never by name**: OSM labels regions in the local language
("Asturias / Asturies", "Euskadi", "Catalunya"), so a Spanish-name query silently
returns zero for exactly those regions. Set `RESUME=1` to skip regions already in the
raw file, and `CATALOG_LOG=<path>` to get unbuffered progress.

Overpass answers a timed-out query with **HTTP 200, partial elements and a `remark`**,
and mirrors can also return **well-formed JSON that is simply missing elements, with no
remark at all** (Normandie came back with 25 of 38, Andalucía with 150 of 507). Every
region fetch is therefore checked against `out count` and retried until it matches;
`VERIFY=1` re-checks the whole raw file, `ONLY_REGIONS=a,b` limits a run. Ireland is queried for bays and shingle as
well as beaches, because OSM maps Irish beaches sparsely: County Clare, the home of
Irish surfing, has four tagged `natural=beach`.

**Stage 2** probes bathymetry **locally**: `scripts/lib/bathymetry.mjs` downloads NOAA
ETOPO1 tiles from ERDDAP once into `.cache/etopo/` and interpolates bilinearly (which
reproduces OpenTopoData's values on 44 of 45 sampled spots). Public elevation APIs
were abandoned after both hit daily quotas mid-run. `ONLY_COUNTRIES=France,United Kingdom`
re-derives just those countries and leaves every other spot byte-identical.

Stage 2 decides which features actually face open ocean. It probes elevation along
12 bearings 6 km out; a bearing is open water when the sample is at or below sea level,
and a spot needs a contiguous arc of at least 90° to qualify. That arc becomes the swell
window, its bisector the facing direction, and the reciprocal the offshore wind angle.
A cove inside a ría has water in front of it but no arc, which is what separates it from
a surfable beach without anyone judging spots by hand.

`idealHeight` is a generic per-level default: OSM knows nothing about how a given bank
breaks, and inventing per-spot numbers would be fabricating precision.

Anything unverifiable is dropped and recorded in `src/data/spots.catalog-report.json`
with its reason.

## Data transparency panel

The info button in the header opens `DataInfoPanel`: sources, per-model freshness, the
app's cache duration, how the rating works, the catalogue and known limitations.

- Model freshness comes from Open-Meteo's real metadata at
  `{marine-api|api}.open-meteo.com/data/{model}/static/meta.json`
  (`last_run_availability_time`, `update_interval_seconds`), served by
  `/api/data-status` with a 10-minute cache. Next update is *expected* at last
  availability + interval; past that it reads "Due now", never a negative time.
- Open-Meteo's best match does not say which model served a given spot, so the panel
  lists candidate models instead of claiming one.
- The explanatory copy mirrors `star-engine.ts` and the calibration numbers. **If the
  rating changes, update the panel text in the same change.**

## Regions and loading

There is no "all regions" view. It meant one forecast request per spot in the country
and an undifferentiated cloud of dots. Country and region are always both set, derived
from geolocation via the nearest catalogued spot (`src/services/regions.ts`) — nearest
spot beats bounding boxes because regions interlock along the coast — and defaulting to
Cataluña. A manual pick is never overwritten by a late geolocation callback.

The map scores **every spot near the viewport** through `/api/forecast/batch`: each
region's spots are ordered by id and cut into fixed chunks of 50
(`src/services/spot-batches.ts`), each chunk is two upstream Open-Meteo calls with all 50
coordinates covering the **whole horizon** (anchor UTC hour + 168 h), joined by timestamp.
The response is compact parallel arrays per spot (`stars`, `swellStars`, `height` in dm,
`period`, `danger` indices) plus the UTC `start`; the client looks hours up by absolute
time (`services/map-summary.ts`), so the time slider never requests anything and a chunk
is refetched only after 60 min. Open-Meteo's free tier limits calls per minute (a
preview deploy once hit 429 after ~10 hour-by-hour chunks), so the client runs at most
two chunks at once and retries a failed chunk by itself after 20 s.

The same horizons feed the bottom sheet: **Best in view** (top 3 at the selected hour,
opening the spot *at that hour* because that is what was ranked) and each day chip's
best score, plus a per-region "best today" shown in the region picker for regions
scored this session. A marker is only created once its spot has a rating with data; spots without
data never appear. The earlier per-spot fetching was capped at 60 spots per viewport and
left 194 of 300 Catalan markers permanently hollow — do not reintroduce a cap.

## UI system

Approved design: https://claude.ai/artifact/DaKvq44utPzrFcqztPEDyx. Tokens live in
`globals.css` `@theme` (`bg-ground`, `bg-sheet`, `bg-card`, `border-line`, `text-ink-0..3`,
`bg-epic`, `bg-fair`, `bg-alert`). Rules: **yellow only means surf quality**, actions are
white/neutral, no brand blue; nothing under 12 px (an E2E walks the DOM to check); touch
targets 44 px. Region and level are Vaul sheets (`RegionPicker`, `LevelPicker`), not native
selects; level only changes safety alerts. The spot detail leads with a one-line verdict
(`services/verdict.ts`) and the day's best window, then swell/period/wind cards, a tide
curve and folded sea-state details. `globals.css` once forced Arial over Geist; keep the
body on `var(--font-sans)`.

The conditions legend lives as the first section of the info panel, not over the map. The
panel is cards with quick links that scroll the panel itself; all content stays rendered.

## Puertos del Estado — investigated, not integrated

Public THREDDS at `opendap.puertos.es` serves regional wave grids for Spain (0.7–3 km,
72 h, twice daily), but Puertos del Estado's terms for its data service authorise use only
for the purpose of the download and **forbid transferring the data to third parties**,
which a public web app does. Do not integrate it without written authorisation. The open
alternative is Copernicus Marine `IBI_ANALYSISFORECAST_WAV_005_005` (needs an account).
Details: `openspec/changes/archive/*-spot-timeline-and-info-redesign/design.md`.

## Verification

```bash
npm run test:unit   # timeline maths, tide detection, colour rules, catalogue integrity
npm run test:e2e    # browser flows against the production build
npm test            # unit + e2e (no network beyond the local server)
npm run test:prod   # smoke test against the live deployment; hits real APIs
```

E2E runs against `next build && next start`, not the dev server: that is what Vercel
serves, and the dev server's HMR channel does not hydrate reliably under Playwright.
