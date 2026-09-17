## Why

El catálogo de spots y los datos de forecast que muestra Wave Reader no son fiables: 12 de 61 spots comparten coordenadas con otro spot, las 61 están redondeadas a 2 decimales (~1 km de error) y varias caen en mar abierto o tierra adentro. El viento se pide a `marine-api.open-meteo.com`, que no sirve `wind_speed_10m` (devuelve `null`), y como `null * 1.852 === 0` en JavaScript la UI muestra `0 km/h` y el badge "Glass" en todos los spots, siempre — un dato falso pero creíble. Además la barra temporal no se puede leer (no distingue días ni zona horaria) y la escala de calidad usa verde en los marcadores, que se confunde con "condiciones buenas" cuando significa "mediocre". Sin esto corregido la app da consejo incorrecto a surfistas sobre condiciones de mar, que es un riesgo de seguridad real para principiantes.

## What Changes

- **BREAKING**: `src/data/spots.json` se regenera con coordenadas obtenidas de OpenStreetMap y verificadas contra elevación; los spots que no se puedan verificar se eliminan del catálogo en vez de conservarse con datos inventados. El número de spots bajará.
- El viento pasa a obtenerse de `api.open-meteo.com/v1/forecast` (endpoint meteorológico) en lugar del endpoint marino, y se elimina la multiplicación `* 1.852`, que corrompía un valor que Open-Meteo ya entrega en km/h.
- El drawer de spot muestra dirección de swell, fuerza y dirección de viento con badge de color legible, gradiente de color por altura de ola, y una sección ampliada con swell secundario y olas de viento.
- Nueva detección de pleamar y bajamar del día a partir de los extremos locales de la serie `sea_level_height_msl`.
- La barra temporal se reconstruye: arranca en la hora actual redondeada hacia arriba, avanza de hora en hora, resuelve la zona horaria desde las coordenadas del spot y agrupa visualmente por días.
- Se elimina el verde de la escala de calidad en todas las superficies (drawer y marcadores del mapa, que aún usan `#6EE7B7`), sustituido por amarillo de opacidad creciente; las condiciones que exceden el nivel de un principiante se marcan en rojo con un mensaje que explica por qué son peligrosas en ese spot concreto.
- Se reconstruye la suite E2E: no existe `playwright.config.ts` ni el script `test:e2e` que documenta `CLAUDE.md`, y `tests/mvp.spec.ts` asserta un formato (`+24h`) que la UI ya no produce.

## Capabilities

### New Capabilities
- `spot-catalog`: Procedencia y validación geográfica de los spots. Cada spot tiene coordenadas verificables contra una fuente externa y cae en costa, no en mar abierto ni tierra adentro.
- `marine-data`: Obtención y normalización del forecast desde Open-Meteo. Define qué endpoint sirve cada magnitud, en qué unidades se expone y cómo se comportan los valores ausentes.
- `tide-extremes`: Cálculo de pleamar y bajamar del día a partir de la serie horaria de nivel del mar.
- `forecast-timeline`: Selección temporal del forecast: granularidad horaria, anclaje a la hora actual, zona horaria y agrupación por días.
- `condition-rating`: Traducción de la puntuación de condiciones a señales visuales y avisos de seguridad según el nivel del surfista.

### Modified Capabilities
<!-- Ninguna: openspec/specs/ está vacío, no hay specs previos que modificar. -->

## Impact

- **Datos**: `src/data/spots.json` (regenerado). Nuevo script de generación y validación del catálogo.
- **Servicios**: `src/services/marine-api.ts` (segundo endpoint, unidades, manejo de null), `src/services/star-engine.ts` (motivo de la alerta por spot), nuevo módulo de mareas y nuevo módulo de tiempo/zona horaria.
- **API**: `src/app/api/forecast/route.ts` — la respuesta incorpora mareas y viento corregido. La clave de caché debe incluir el nivel del surfista, que hoy no incluye.
- **UI**: `src/components/shared/SpotDetailDrawer.tsx`, `src/components/shared/MarineMap.tsx`, `src/app/page.tsx`, `src/store/useStore.ts`.
- **Dependencias externas**: se añade una llamada a `api.open-meteo.com/v1/forecast` por spot y consulta; OpenStreetMap Nominatim se usa solo en tiempo de generación del catálogo, nunca en runtime.
- **Testing**: nuevo `playwright.config.ts`, script `test:e2e`, reescritura de `tests/`.
