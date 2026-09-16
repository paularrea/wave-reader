# Proposal: Phase 1 - Foundation (Map & Star Engine)

## Objective
Implement the core infrastructure of Wave Reader: a functional map with spot markers that calculate real-time star ratings using the Star Engine and Open-Meteo API.

## Technical Plan

### 1. Infrastructure & API
- **Open-Meteo Client**: Create a service in `src/services/marine-api.ts` to fetch swell and wind data.
- **Star Engine**: Implement the logic in `src/services/star-engine.ts` based on the weights defined in `docs/ARCHITECTURE.md`.
- **API Route**: Create `src/app/api/forecast/route.ts` to expose the star calculation to the frontend.

### 2. Frontend Implementation
- **Mapbox Setup**: Install `mapbox-gl` and create the `MarineMap` component in `src/components/shared/`.
- **Spot Markers**: Logic to iterate through `data/spots.json` and render custom markers that call the `/api/forecast` endpoint.
- **State Management**: Use a simple React context or Zustand to track `currentTime` and `userSkillLevel`.
- **Detail Drawer**: Implement a `SpotDetailDrawer` using shadcn's `vaul` (drawer) component.

### 3. Verification Criteria
- [ ] Map centers on user geolocation.
- [ ] All spots from `data/spots.json` appear as markers.
- [ ] Markers display a star rating (0-10) that changes when the user skill level is toggled.
- [ ] Clicking a marker opens the drawer with raw marine data.
