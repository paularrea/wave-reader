# Product Requirements Document (PRD) - Wave Reader

## 1. Project Vision
Wave Reader is a high-performance, mobile-first web application designed exclusively for surfers. The primary goal is to eliminate the friction of finding the "perfect spot" by combining the visual power of atmospheric flow maps (like Windy.com) with a simplified, star-based ranking system for surf spots.

**Value Proposition:** "The quickest way for surfers to decide where to surf today."

## 2. Target Audience
- **Demographics:** Ages 25-45.
- **Persona:** Surfers (from beginners to professionals).
- **User Need:** High-accuracy surf forecasts presented in a way that requires zero interpretation effort, personalized to their skill level.

## 3. Core Features (MVP)

### 3.1 Interactive Marine Map
- **Geolocated Center:** App opens centered on the user's current position.
- **Interactive Navigation:** Smooth panning and zooming (Mobile-first).
- **Dynamic Star Overlay:** Surf spots displayed as markers with star ratings (0-10). The rating is calculated by crossing real-time marine data with a proprietary spot-configuration database.

### 3.2 Atmospheric Visualization (The "Windy" Experience)
- **Flow Layers:** Visual particle animations showing wind and swell directions and intensity.
- **Chromatic Encoding:** Colors vary based on wind/swell power.
- **Layer Toggles:** Ability to switch between Wind Flow and Swell Flow.

### 3.3 Temporal Playback (Forecast Timeline)
- **Time Slider:** A playback bar at the bottom of the screen.
- **Dynamic Updates:** Moving the slider updates the star rankings and flow particles in real-time for the selected hour/day.

### 3.4 Spot Intelligence & Personalization
- **Skill-Based Ranking:** Users can set their level (Beginner, Intermediate, Expert). The star algorithm adjusts the ranking based on the "ideal conditions" for that specific level.
- **Detail Drawer:** Tapping a spot opens a bottom-sheet with:
    - Exact Swell Height, Period, and Direction.
    - Wind Speed and Direction.
    - Current Star Rating for the selected user level.
- **Direct Navigation:** A "Go to Spot" button that deep-links to Google Maps.

## 4. Technical Constraints & Stack
- **Frontend/Backend:** Next.js 15 (App Router) with TypeScript.
- **UI Framework:** Tailwind CSS + Shadcn UI.
- **Map Engine:** Mapbox GL JS for high-performance GPU rendering of particles.
- **Data Sources:** 
    - Marine Data: Open-Meteo Marine API (for swell and wind data).
    - Spot Config: Internal database containing ideal conditions (swell window, offshore wind) for each spot.
    - Navigation: Google Maps API.
- **Deployment:** Vercel.

## 5. Success Metrics (KPIs)
- **Time to Value:** Average time from app open to spot selection.
- **Session Frequency:** Number of times a user checks the app per "surf day".
- **Accuracy Feedback:** User-reported correlation between stars and actual conditions.

## 6. MoSCoW Matrix
- **Must Have:** Map, Star Rankings, Basic Swell/Wind data, Time Slider, Google Maps Link.
- **Should Have:** Animated flow particles (Wind/Swell), Detailed Spot Drawer.
- **Could Have:** User profiles to customize "Ideal Conditions" (Personalized Stars).
- **Won't Have (MVP):** Community chat, Live webcams, Paid premium tiers.
