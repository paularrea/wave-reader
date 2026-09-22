import { test, expect } from '@playwright/test';
import { allSpots } from '../../src/services/spot-catalogue';
import report from '../../src/data/spots.catalog-report.json';
import curation from '../../src/data/spots.curation-report.json';
import regions from '../../src/data/regions.json';
import attested from '../../src/data/surf-spots.attested.json';
import coordinateCheck from '../../src/data/spots.coordinate-check.json';

/**
 * Guards the published catalogue. These are the checks the original
 * hand-written catalogue failed: 12 of 61 spots shared coordinates with another
 * spot, every coordinate was rounded to 2 decimals, and several sat in open
 * ocean or inland.
 */

interface Provenance {
  source: string;
  osmType: string;
  osmId: number;
  facingDeg: number;
  exposureDeg: number;
}

interface Spot {
  id: string;
  name: string;
  community: string;
  country: string;
  coordinates: { lat: number; lon: number };
  config: {
    swellWindow: { minAngle: number; maxAngle: number };
    offshoreWindAngle: number;
    windTolerance: number;
    idealHeight: Record<'beginner' | 'intermediate' | 'expert', { min: number; max: number }>;
  };
  provenance: Provenance;
}

const catalogue = allSpots() as unknown as Spot[];

test.describe('spec: spot-catalog / Coordenadas trazables', () => {
  test('every spot records where its coordinate came from', () => {
    for (const spot of catalogue) {
      expect(spot.provenance, `${spot.name} has no provenance`).toBeTruthy();
      expect(spot.provenance.source).toContain('openstreetmap');
      expect(spot.provenance.osmId).toBeTruthy();
      expect(spot.provenance.osmType).toBeTruthy();
    }
  });

  test('unverifiable features were dropped with a recorded reason', () => {
    for (const dropped of report.dropped) {
      expect(dropped.reason, `${dropped.name} dropped without a reason`).toBeTruthy();
    }
  });
});

test.describe('spec: spot-catalog / Exposición al mar abierto', () => {
  test('every spot has a swell window wide enough to break', () => {
    // A cove inside a ría has water in front of it but no swell window; this
    // is what separates it from a surfable beach.
    //
    // Ireland is the exception: its breaks sit at the head of bays and face the
    // mouth, which spans one or two bearings 6 km out (Lahinch in Liscannor
    // Bay, Inch in Dingle Bay). A surf reference has to name the place before
    // it is published, so there the window only has to exist.
    for (const spot of catalogue) {
      const floor = spot.country === 'Ireland' ? 30 : 90;
      expect(spot.provenance.exposureDeg, `${spot.name} is sheltered`).toBeGreaterThanOrEqual(floor);
    }
  });

  test('a window narrower than 90 degrees is only ever a named Irish break', () => {
    const names = new Set(attested.spots.map(a => a.id));
    for (const spot of catalogue) {
      if (spot.provenance.exposureDeg >= 90) continue;
      expect(spot.country, `${spot.name} is sheltered outside Ireland`).toBe('Ireland');
      expect(names.has(spot.id), `${spot.name} is sheltered and unnamed`).toBe(true);
    }
  });

  test('the offshore wind angle is opposite the way the spot faces', () => {
    for (const spot of catalogue) {
      const expected = (spot.provenance.facingDeg + 180) % 360;
      const diff = Math.abs(spot.config.offshoreWindAngle - expected);
      expect(Math.min(diff, 360 - diff), `${spot.name}`).toBeLessThanOrEqual(1);
    }
  });

  test('every bearing in the config is a valid compass bearing', () => {
    for (const spot of catalogue) {
      for (const bearing of [
        spot.config.offshoreWindAngle,
        spot.config.swellWindow.minAngle,
        spot.config.swellWindow.maxAngle,
        spot.provenance.facingDeg,
      ]) {
        expect(bearing, `${spot.name}`).toBeGreaterThanOrEqual(0);
        expect(bearing, `${spot.name}`).toBeLessThan(360);
      }
    }
  });
});

test.describe('spec: spot-catalog / Sin coordenadas duplicadas', () => {
  test('no two spots share a coordinate', () => {
    const seen = new Map<string, string>();
    for (const spot of catalogue) {
      const key = `${spot.coordinates.lat},${spot.coordinates.lon}`;
      expect(seen.has(key), `${spot.name} duplicates ${seen.get(key)}`).toBe(false);
      seen.set(key, spot.name);
    }
  });

  test('coordinates are not systematically rounded', () => {
    // The original hand-written catalogue had every coordinate at 2 decimals,
    // about 1 km of error. Real OSM coordinates occasionally end in zeros
    // (-8.883 is -8.88300), so the invariant is that coarseness is incidental,
    // not that every value prints four decimals.
    const decimalsOf = (value: number) => String(value).split('.')[1]?.length ?? 0;

    // Per-spot this cannot be asserted: a genuine OSM centroid may land on
    // -8.90000, and a handful do. What the old catalogue failed was the
    // distribution -- all 61 of its coordinates sat on a 0.01 grid.
    const precise = catalogue.filter(
      spot =>
        decimalsOf(spot.coordinates.lat) >= 4 && decimalsOf(spot.coordinates.lon) >= 4
    );

    expect(
      precise.length / catalogue.length,
      'catalogue looks uniformly rounded to ~1 km'
    ).toBeGreaterThan(0.95);
  });

  test('ids are unique', () => {
    expect(new Set(catalogue.map(s => s.id)).size).toBe(catalogue.length);
  });
});

test.describe('spec: spot-catalog / Cobertura', () => {
  test('the catalogue is not empty', () => {
    expect(catalogue.length).toBeGreaterThan(0);
  });

  test('every spot declares a country and a region', () => {
    for (const spot of catalogue) {
      expect(spot.country, `${spot.name} has no country`).toBeTruthy();
      expect(spot.community, `${spot.name} has no region`).toBeTruthy();
    }
  });

  test('every spot keeps the config the rating engine needs', () => {
    for (const spot of catalogue) {
      expect(spot.config.swellWindow).toBeTruthy();
      expect(typeof spot.config.offshoreWindAngle).toBe('number');
      for (const level of ['beginner', 'intermediate', 'expert'] as const) {
        const range = spot.config.idealHeight[level];
        expect(range.min, `${spot.name} ${level}`).toBeLessThan(range.max);
      }
    }
  });
});


test.describe('spec: spot-catalog / Cobertura de Francia y Reino Unido', () => {
  test('the catalogue covers Spain, Ireland, France and the United Kingdom', () => {
    const countries = new Set(catalogue.map(s => s.country));
    for (const c of ['Spain', 'Ireland', 'France', 'United Kingdom']) expect(countries).toContain(c);
  });

  test('England is split into counties, not one region', () => {
    const ukRegions = new Set(catalogue.filter(s => s.country === 'United Kingdom').map(s => s.community));
    expect(ukRegions).toContain('Cornwall');
    expect(ukRegions).toContain('Devon');
    expect(ukRegions).not.toContain('England');
  });

  test('France includes its overseas regions', () => {
    const frRegions = new Set(catalogue.filter(s => s.country === 'France').map(s => s.community));
    expect(frRegions).toContain('Bretagne');
    expect(frRegions).toContain('La Réunion');
  });
});

test.describe('spec: spot-catalog / Solo spots con datos de oleaje', () => {
  test('spots without wave model data are recorded as dropped, not kept', () => {
    const dropped = report.dropped.filter(d => d.reason === 'no wave model data at these coordinates');
    const kept = new Set(catalogue.map(s => `${s.name}|${s.community}`));
    for (const d of dropped) expect(kept.has(`${d.name}|${d.community}`), `${d.name} kept without data`).toBe(false);
  });
});

test.describe('spec: spot-catalog / Spots de surf, no toda playa etiquetada', () => {
  // "Marina" and "harbour" are not on this list: Playa de Santa Marina,
  // Son Serra de Marina and St Ives' Harbour Beach are breaks both surf
  // references list. Attestation, not a name pattern, decides what is surf.
  const NOT_SURF = /(d[àa]rsena|\bmoll\b|\bmuelle\b|embarcader|\bdique\b|\bpiscina\b|\bdock\b|\bquay\b|\bjetty\b)/i;

  test('harbour infrastructure and inland water are not in the catalogue', () => {
    for (const spot of catalogue) {
      expect(NOT_SURF.test(spot.name), `${spot.name} is not a surf spot`).toBe(false);
    }
  });

  test('the same place mapped twice in the source is published once', () => {
    // OSM carries both "Ondres-Ocean" and "Plage Ondres-Ocean", and "Plage du
    // Metro" three times along one kilometre. One assertion at the end, not one
    // per pair: 200,000 expect() calls took nine minutes of the unit suite.
    const key = (name: string) =>
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(praia|playa|platja|plage|beach|strand|de|del|du|des|la|le|les|el|els|a|o)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const rad = Math.PI / 180;
    const twins: string[] = [];
    const byName = new Map<string, Spot[]>();
    for (const spot of catalogue) {
      const k = `${spot.country}|${spot.community}|${key(spot.name)}`;
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k)!.push(spot);
    }
    for (const group of byName.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i].coordinates;
          const b = group[j].coordinates;
          const km =
            6371 *
            Math.sqrt(
              ((b.lat - a.lat) * rad) ** 2 +
                (Math.cos(((a.lat + b.lat) / 2) * rad) * (b.lon - a.lon) * rad) ** 2
            );
          if (km < 1.5) twins.push(`${group[i].name} / ${group[j].name}: ${km.toFixed(2)} km`);
        }
      }
    }
    expect(twins.join('\n')).toBe('');
  });

  test('REGRESSION: named breaks survive even when they share a forecast cell', () => {
    // Anglet's twelve peaks sit inside four kilometres; deduplicating by
    // distance alone left one of them, and took La Graviere, Le Santocha and
    // La Piste out of the Landes with it. (La Milady is not here: neither
    // surf reference lists it, so it is not attested.)
    const names = catalogue
      .filter(s => s.community === 'Nouvelle-Aquitaine')
      .map(s => s.name.toLowerCase());

    for (const break_ of [
      'lafitenia',
      'parlementia',
      'gravière',
      'santocha',
      'la piste',
      'cavaliers',
      'estagnots',
      'penon',
      'marinella',
    ]) {
      expect(
        names.some(n => n.includes(break_)),
        `${break_} is missing from Nouvelle-Aquitaine`
      ).toBe(true);
    }

    // Four of Anglet's peaks, within 2 km of each other, all published.
    const anglet = catalogue.filter(
      s => s.coordinates.lat > 43.5 && s.coordinates.lat < 43.53 && s.coordinates.lon < -1.5
    );
    expect(anglet.length).toBeGreaterThanOrEqual(4);
  });

  test('every place dropped by the curation says why', () => {
    expect(curation.dropped.length).toBeGreaterThan(0);
    for (const d of curation.dropped) expect(d.reason, `${d.name}`).toBeTruthy();
  });

  test('the curated catalogue is a fraction of the tagged beaches', () => {
    expect(catalogue.length).toBe(curation.out);
    expect(curation.out).toBeLessThan(curation.in / 3);
  });

  test('a generic name does not pass itself off as a named break', () => {
    // "Plage du Nord" matched the curated "La Cantine Nord" while containment
    // ran both ways, and "La plage Blanche" matched "La Lette Blanche". Being
    // treated as named exempted both from deduplication, so they survived
    // beside the real break. They are only observable as drops.
    const published = new Set(catalogue.filter(s => s.community === 'Nouvelle-Aquitaine').map(s => s.name));
    for (const fragment of ['Plage du Nord', 'La plage Blanche']) {
      expect(published.has(fragment), `${fragment} was treated as a named break`).toBe(false);
    }
  });
});

test.describe('spec: spot-catalog / Publicado por país', () => {
  test('regions.json agrees with the per-country files', () => {
    for (const country of regions.countries) {
      for (const region of country.regions) {
        const actual = catalogue.filter(s => s.country === country.name && s.community === region.name).length;
        expect(actual, `${country.name} / ${region.name}`).toBe(region.spots);
      }
    }
  });

  test('every spot belongs to a region the selector offers', () => {
    const known = new Set(
      regions.countries.flatMap(c => c.regions.map(r => `${c.name}|${r.name}`))
    );
    for (const spot of catalogue) {
      expect(known.has(`${spot.country}|${spot.community}`), `${spot.name}`).toBe(true);
    }
  });
});

test.describe('spec: spot-catalog / Solo spots atestiguados', () => {
  const attestedIds = new Map(attested.spots.map(a => [a.id, a]));
  const checks = coordinateCheck.spots as Record<string, { ok: boolean; reason: string | null; waterName?: string | null }>;

  test('every published spot is attested by a surf reference', () => {
    // An exposed beach is not a surf spot. Publishing every exposed OSM beach
    // shipped 1,690 places where the references list a few hundred.
    const unattested = catalogue.filter(s => !attestedIds.has(s.id)).map(s => `${s.name} (${s.community})`);
    expect(unattested.join('\n')).toBe('');
  });

  test('every attestation names the reference it came from', () => {
    for (const s of catalogue) {
      const a = attestedIds.get(s.id)!;
      expect(a.sources.length, s.name).toBeGreaterThan(0);
      expect(a.attestedAs.length, s.name).toBeGreaterThan(0);
    }
  });

  test('every published coordinate passed the coastline check', () => {
    const failed = catalogue
      .filter(s => !checks[s.id]?.ok)
      .map(s => `${s.name}: ${checks[s.id]?.reason ?? 'never checked'}`);
    expect(failed.join('\n')).toBe('');
  });

  test('REGRESSION: no published spot faces the Mar Menor or another closed sea', () => {
    // OSM draws natural=coastline around the Mar Menor too, so the lagoon
    // shore passed a plain coastline check. Its beaches face water five metres
    // deep that never sees swell.
    for (const id of ['playa-de-punta-brava', 'playa-de-mar-de-cristal']) {
      expect(catalogue.some(s => s.id === id), id).toBe(false);
    }
    const lagoon = catalogue.filter(s => /Mar Menor|[ÉE]tang|Albufera/i.test(checks[s.id]?.reason ?? ''));
    expect(lagoon.map(s => s.name).join('\n')).toBe('');
  });

  test('REGRESSION: a reference is not pinned on the wrong beach by proximity alone', () => {
    // Mundaka's reference coordinate is 460 m from an OSM cove called
    // Basamortu kala. Matching by nearest place attested the cove as Mundaka.
    const cove = catalogue.find(s => s.name === 'Basamortu kala');
    expect(cove ? attestedIds.get(cove.id)!.attestedAs : []).not.toContain('Mundaka');
  });
});
