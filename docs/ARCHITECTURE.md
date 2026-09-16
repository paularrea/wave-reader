# Technical Architecture - Wave Reader

## 1. High-Level System Design
Wave Reader is a full-stack Next.js application that combines real-time marine weather data with a proprietary spot-configuration database to provide personalized surf rankings.

### Data Flow
`Open-Meteo API (Live Data)` $\rightarrow$ `Star Engine (Logic)` $\rightarrow$ `Next.js API Route` $\rightarrow$ `Frontend (Mapbox GL)`

## 2. Component Architecture

### Frontend (React/Next.js)
- **`MapProvider`**: Context provider to manage global map state (center, zoom, current time, selected skill level).
- **`MarineMap`**: Core Mapbox implementation.
    - `ParticleLayer`: GPU-accelerated wind/swell flow using `mapbox-exif-layer`.
    - `SpotMarkerLayer`: Dynamic markers that change size/color based on star rating.
- **`TimelineController`**: 
    - A playback bar that manages the `currentTime` state.
    - Triggers a re-fetch of star ratings when the time changes.
- **`SpotDetailDrawer`**: A shadcn-based bottom sheet displaying:
    - Current conditions (Swell height, period, wind).
    - The calculated star rating for the user's level.
    - Google Maps deep-link.

### Backend (Next.js API Routes)
- **`/api/spots`**: Returns the list of all spots from `data/spots.json`.
- **`/api/forecast`**: 
    - Input: `spotId`, `timestamp`, `skillLevel`.
    - Process: Fetches live data from Open-Meteo $\rightarrow$ Applies the Star Engine logic $\rightarrow$ Returns stars + raw data.

## 3. The Star Engine Logic
The ranking is calculated as a weighted score from 0 to 10:

1.  **Swell Filter:** If `currentSwellDirection` is outside the spot's `swellWindow` $\rightarrow$ **Score = 0**.
2.  **Wind Weight:** 
    - Offshore (Ideal): $\times 1.5$
    - Calm: $\times 1.0$
    - Onshore: $\times 0.5$
3.  **Height Match:**
    - If `currentHeight` is within the `idealHeight[skillLevel]` range $\rightarrow$ **Max Score**.
    - If outside, apply a linear penalty based on the distance to the ideal range.
4.  **Period Bonus:** Higher periods (10s+) add a bonus to the final score.

## 4. Technical Stack Summary
- **Framework:** Next.js 15 (App Router).
- **Map Engine:** Mapbox GL JS.
- **Styling:** Tailwind CSS + Shadcn UI.
- **Marine Data:** Open-Meteo Marine API.
- **Data Storage:** Local JSON (`data/spots.json`) for MVP.
- **Deployment:** Vercel.
