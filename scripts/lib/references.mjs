/**
 * What the surf references say, and how their names are compared with
 * OpenStreetMap's. Shared by stage 3.5 (attestation), which resolves each
 * reference name to an OSM place, and stage 3.5b (reference breaks), which
 * publishes the surf-forecast breaks no OSM place answered to.
 */

/**
 * The countries whose surf-forecast list is published in full: every break at
 * an OSM place or, failing one, at their coordinate (stage 3.5b), under their
 * name (stage 4). One country per deploy, each checked before the next is added.
 */
export const FULL_LIST_COUNTRIES = ['Spain', 'France', 'United Kingdom', 'Portugal'];

/** surf-forecast's country pages, and the catalogue country each one feeds. */
export const COUNTRY_OF = {
  Spain: 'Spain',
  'Spain-1': 'Spain', // surf-forecast files the Canaries under Spain (Africa)
  France: 'France',
  'United-Kingdom': 'United Kingdom',
  Ireland: 'Ireland',
  Guadeloupe: 'France',
  Martinique: 'France',
  Reunion: 'France',
  'French-Guiana': 'France',
  'United Kingdom': 'United Kingdom',
  'Réunion': 'France',
  Gibraltar: null,
  Portugal: 'Portugal',
  'Isle of Man': null,
};


/**
 * surf-forecast groups breaks by surfing region -- "Gower", "La Cote Basque",
 * "North East England" -- which is not how this catalogue is divided. Without
 * the hint, a name on its own is ambiguous up and down a coast: "Santa Marina"
 * is a beach in Asturias and another in Galicia, and refusing to guess threw
 * away a match the reference had already disambiguated.
 *
 * A reference region maps to the set of our regions it can mean. Several of
 * theirs straddle ours, so the set narrows the candidates without pretending to
 * pick between them; a name still has to resolve to exactly one place.
 * Regions mapped to null are coasts this catalogue does not cover.
 */
export const FORECAST_REGIONS = {
  // Spain
  Andalucia: ['Andalucía'],
  Asturias: ['Asturias'],
  'Balearic Islands (Islas Baleares)': ['Baleares'],
  Catalunia: ['Cataluña'],
  Galicia: ['Galicia'],
  Murcia: ['Murcia'],
  'Pais Vasco': ['País Vasco'],
  'Spain - Cantabria': ['Cantabria'],
  Valencia: ['Comunidad Valenciana'],
  Fuerteventura: ['Canarias'],
  'Gran Canaria': ['Canarias'],
  Lanzarote: ['Canarias'],
  Tenerife: ['Canarias'],
  // France
  'Charente Maritime': ['Nouvelle-Aquitaine'],
  Gironde: ['Nouvelle-Aquitaine'],
  Landes: ['Nouvelle-Aquitaine'],
  'La Cote Basque': ['Nouvelle-Aquitaine'],
  Corsica: ['Corse'],
  "Cote d'Armor - Brittany": ['Bretagne'],
  'Finistere - Brittany': ['Bretagne'],
  'Ile et Vilaine - Brittany': ['Bretagne'],
  'Morbihan - Brittany': ['Bretagne'],
  "Cote d'Azur": ["Provence-Alpes-Côte d'Azur"],
  'Languedoc-Roussillon': ['Occitanie'],
  'Loire Atlantique': ['Pays de la Loire'],
  Vendee: ['Pays de la Loire'],
  'Nord - Pas de Calais': ['Hauts-de-France'],
  Normandy: ['Normandie'],
  'Guadeloupe - Grande Terre': ['Guadeloupe'],
  Martinique: ['Martinique'],
  'Réunion Island': ['La Réunion'],
  'French Guiana': ['Guyane'],
  // Ireland -- their country page covers the whole island, so two of their
  // regions belong to our United Kingdom.
  Clare: ['Clare'],
  Cork: ['Cork'],
  Donegal: ['Donegal'],
  Kerry: ['Kerry'],
  'Mayo and Achill Island': ['Mayo'],
  Sligo: ['Sligo'],
  Waterford: ['Waterford'],
  Wexford: ['Wexford'],
  Antrim: ['Northern Ireland'],
  Londonderry: ['Northern Ireland'],
  // United Kingdom
  'North Cornwall': ['Cornwall'],
  'South Cornwall': ['Cornwall'],
  'North Devon': ['Devon'],
  'South Devon': ['Devon'],
  Anglesy: ['Wales'],
  Gower: ['Wales'],
  'Lleyn Peninsula': ['Wales'],
  'Mid Wales': ['Wales'],
  'North Wales': ['Wales'],
  Pembrokeshire: ['Wales'],
  'Inner Hebrides': ['Scotland'],
  'Outer Hebrides': ['Scotland'],
  Kintyre: ['Scotland'],
  'Orkney Islands': ['Scotland'],
  'Scotland - East Coast': ['Scotland'],
  'Scotland - North Coast': ['Scotland'],
  'Isle of Wight': ['Isle of Wight'],
  'North East England': ['Northumberland', 'Tyne and Wear', 'County Durham', 'North Yorkshire', 'East Riding of Yorkshire'],
  'East Anglia': ['Norfolk', 'Suffolk', 'Essex'],
  'South Coast of England': ['Dorset', 'Hampshire', 'East Sussex', 'West Sussex', 'Isle of Wight', 'Kent'],
  // South East *Wales*: Porthcawl, Llantwit Major, Ogmore-by-Sea.
  'South East': ['Wales'],
  // Portugal -- stage 1 fetches it by district; stage 4 publishes it under
  // these regions. Peniche, Ericeira and Lisboa cut across districts, and Beira
  // runs into Leiria (Nazaré), so each lists every district it can mean.
  'Douro and Minho': ['Viana do Castelo', 'Braga', 'Porto'],
  Beira: ['Aveiro', 'Coimbra', 'Leiria'],
  Peniche: ['Leiria', 'Lisboa'],
  Ericeira: ['Lisboa'],
  Lisboa: ['Lisboa', 'Setúbal'],
  'Portugal - Alentejo': ['Setúbal', 'Beja'],
  'The Algarve': ['Faro'],
  Madeira: ['Madeira'],
  'The Azores': ['Açores'],
  // Coasts this catalogue does not cover
  Alderney: null,
  Guernsey: null,
  Jersey: null,
  'Isle of Man': null,
  // OSM names no beach here; surf-forecast's coordinates (stage 3.5b) cover it.
  Lincolnshire: ['Lincolnshire'],
};

const STOPWORDS = new Set(
  ('praia playa platja plage plaja beach strand traeth hondartza sands sand bay baie bahia baia cove kala cala caleta anse playas plages ' +
   'de del dels des du da do das dos la le les los el els lo s sa a o of the and y e i der den la')
    .split(' ')
);

export function normalise(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .join(' ')
    .trim();
}

export function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const midLat = ((a.lat + b.lat) / 2) * rad;
  return R * Math.sqrt(dLat ** 2 + (Math.cos(midLat) * dLon) ** 2);
}

/**
 * Words a reference adds to say which part of a beach it means. "South Fistral"
 * and "Fistral-North" are both Fistral Beach as far as a place goes.
 */
const QUALIFIERS = new Set(
  'north south east west nord sud norte sur little big main left right centre center central middle'.split(' ')
);

/**
 * Basque place names carry a genitive the surf references drop: Zarautz is
 * mapped as "Zarauzko hondartza", Orio as "Orioko", Deba as "Debako". Only that
 * suffix is forgiven -- a general shared-stem rule let "Carrowmore" stand in
 * for "Carrownisky", two beaches in different bays.
 */
export function genitive(t, u) {
  const [short, long] = t.length <= u.length ? [t, u] : [u, t];
  if (short.length < 4 || !long.endsWith('ko')) return false;
  const base = long.replace(/e?ko$/, '');
  return base === short || base === short.replace(/tz$/, 'z');
}

const token = (t, u) => t === u || genitive(t, u);
const covers = (x, y) => x.every(t => y.some(u => token(t, u)));

/**
 * Two names are the same break when every significant token of one appears in
 * the other. `place` is the OSM name, `ref` the reference's.
 *
 * The reference may be the shorter name ("Rodiles" for "Playa de Rodiles"),
 * and may qualify it ("South Fistral"). The OSM name may be the shorter one only
 * when it has two tokens or more, or when `anchored` -- the reference's own
 * coordinate puts it on the same sand. Unanchored, a one-word OSM place is
 * contained in far too many references: "Ness" in Brims Ness, Grim Ness and
 * Point of Ness; "Playa Roja" in "Cruz Roja".
 */
export function namesAgree(place, ref, anchored = false) {
  if (!place || !ref) return false;
  if (place === ref) return true;
  const tp = place.split(' ');
  const full = ref.split(' ');
  // A qualifier the place does not carry is dropped ("South Fistral" is Fistral
  // Beach); one it contradicts is not ("Portrush East Strand" is not West Strand).
  const placeQualifiers = tp.filter(t => QUALIFIERS.has(t));
  if (placeQualifiers.some(q => !full.includes(q))) return false;
  const tr = full.filter(t => !QUALIFIERS.has(t) || placeQualifiers.includes(t));
  if (tr.length === 0) return false;
  return covers(tr, tp) || ((tp.length >= 2 || anchored) && covers(tp, full));
}

/** Edit-distance similarity, for spellings that drift: Gwynver / Gwenver, Mendia / Mandia. */
function similarity(a, b) {
  const A = a.replace(/ /g, '');
  const B = b.replace(/ /g, '');
  if (!A || !B) return 0;
  const row = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (A[i - 1] === B[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - row[B.length] / Math.max(A.length, B.length);
}

/**
 * Spelling drift is allowed only between long names and only when the two
 * places are close: at 0.75 similarity "Siouville" became "Trouville" and
 * "Trestel" became "Trestrignel", real beaches kilometres apart.
 */
export const spellingDrift = (a, b) => a.replace(/ /g, '').length >= 6 && b.replace(/ /g, '').length >= 6 && similarity(a, b) >= 0.85;

