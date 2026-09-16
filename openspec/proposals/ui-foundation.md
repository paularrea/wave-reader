# Proposal: UI Foundation & Visual System (Phase 1.2)

## Objective
Implement the visual layer of Wave Reader, focusing on a high-performance interactive map and a clear, intuitive ranking system that mimics the visual quality of Windy.com.

## 1. Visual System: The Star Ranking Gradient
The markers on the map will represent the star rating (0-10) using a precise chromatic scale to allow users to identify the best spots at a glance.

### Color Mapping
- **0 - 2 Stars (Poor):** Gray/Muted tones (`#D1D5DB` $\rightarrow$ `#9CA3AF`). Represents "Flat" or "Unrideable".
- **3 - 5 Stars (Fair):** Subtle Blue/Green tones (`#93C5FD` $\rightarrow$ `#6EE7B7`). Represents "Rideable but not great".
- **6 - 8 Stars (Good):** Bright Yellow/Orange tones (`#FDE047` $\rightarrow$ `#FBBF24`). Represents "Good conditions".
- **9 - 10 Stars (Epic):** Shiny Yellow/Gold with Glow (`#FACC15` $\rightarrow$ `#EAB308` + radial gradient/glow). Represents "Peak conditions".

### Marker Design
- **Shape:** Circular markers with a central star icon.
- **Visuals:** The background circle will use the chromatic scale. For 9-10 stars, a subtle pulse animation or outer glow will be added to draw immediate attention.
- **Interaction:** Markers will scale up slightly on hover/tap.

## 2. Technical Implementation Plan

### A. Global State (`src/store/useStore.ts`)
Implementation of a Zustand store to synchronize:
- `selectedSpotId`: Track which spot is currently active.
- `currentTime`: Manage the playback timeline (ISO string).
- `userSkillLevel`: 'beginner' | 'intermediate' | 'expert'.
- `userLocation`: Store geolocation for map centering.

### B. The Marine Map (`src/components/shared/MarineMap.tsx`)
- **Mapbox GL JS Setup**: Implementation of a dark-themed base map to make the colorful star markers pop.
- **Dynamic Marker Layer**:
    - Fetch spots from `data/spots.json`.
    - For each spot, call `/api/forecast` based on `currentTime` and `userSkillLevel`.
    - Map the resulting 0-10 score to the chromatic scale defined above.
- **Performance**: Use Mapbox's `SymbolLayer` or custom HTML markers with optimized re-renders to ensure 60fps panning.

### C. Detail Interface (`src/components/shared/SpotDetailDrawer.tsx`)
- **Component**: Use `vaul` for the bottom-sheet transition.
- **Content**: 
    - Big, bold Star Rating.
    - Summary of the "Why": (e.g., "Perfect Offshore Wind + 1.5m Swell").
    - Raw data grid: Height, Period, Wind.
    - Action: "Open in Google Maps" button.

### D. Integration (`src/app/page.tsx`)
- Layout with the map as the background and the UI controls (Level Selector, Time Slider) as floating overlays.

## 3. Verification Criteria
- [ ] Map opens centered on user location.
- [ ] Markers are rendered with the correct color gradient based on the 0-10 score.
- [ ] 10-star markers have a "shiny" visual distinction.
- [ ] Changing the `userSkillLevel` instantly updates the colors of all markers on the map.
- [ ] Tapping a marker opens the drawer with the correct spot data.
