# Spot Catalog Strategy - Wave Reader

## 1. Goal
Build a comprehensive, structured database of surf spots across Spain, the Balearic Islands, and the Canary Islands. This data will serve as the "configuration layer" for the Star Ranking Engine, allowing the app to translate raw marine data (swell/wind) into a user-friendly star rating (0-10).

## 2. Spot Data Model (Schema)
Each spot entry must follow this structure:

```typescript
interface SurfSpot {
  id: string;                 // Unique slug (e.g., "zarautz-beach")
  name: string;               // Display name
  community: string;          // Autonomous Community (e.g., "Galicia", "Canarias")
  region: 'North' | 'South' | 'East' | 'Canaries' | 'Balearics';
  coordinates: {
    lat: number;
    lon: number;
  };
  type: 'Beach' | 'Point' | 'Reef';
  
  // The "Magic" for the Ranking Engine
  config: {
    swellWindow: {
      minAngle: number;       // Degrees (0-360)
      maxAngle: number;       // Degrees (0-360)
    };
    offshoreWindAngle: number; // The ideal wind direction for this spot
    windTolerance: number;     // Degrees of deviation allowed before rating drops
    
    // Ideal height ranges per skill level (meters)
    idealHeight: {
      beginner: { min: number, max: number };
      intermediate: { min: number, max: number };
      expert: { min: number, max: number };
    };
  };
  
  metadata: {
    difficulty: 'Easy' | 'Medium' | 'Hard';
    bestSeason: string[];      // e.g., ['Autumn', 'Winter']
    description: string;
  };
}
```

## 3. Extraction Workflow
1. **Source Identification:** Use `surf-forecast.com`, `surfline.com`, and local surf guides.
2. **Data Mapping:**
    - Identify the "Swell Window" by analyzing which swell directions the spot is known to work with.
    - Identify the "Offshore Wind" by finding the direction of the land relative to the beach.
3. **Validation:** Cross-reference the "Ideal Conditions" with historical reports.
4. **Storage:** All data is stored in `data/spots.json` for easy access by the Next.js app.

## 4. Priority Map
1. **Phase 1:** Costa Cantábrica & Galicia (The core of Spanish surfing).
2. **Phase 2:** Atlantic Coast (Huelva, Cádiz).
3. **Phase 3:** Canary Islands (The most consistent).
4. **Phase 4:** Balearics & Mediterranean.
