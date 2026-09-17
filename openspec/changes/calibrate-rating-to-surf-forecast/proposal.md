## Why

La puntuación ordenaba bien los días pero inflaba la escala entre 2 y 3 puntos respecto a surf-forecast, la referencia a la que están acostumbrados los usuarios. Un benchmark con 206 franjas horarias reales de surf-forecast dio un error medio de 2,77 estrellas y solo un 15% de aciertos a ±1. Ni surf-forecast ni Surfline publican su fórmula (Surfline usa un modelo entrenado con datos privados), así que la única manera de parecerse es aplicar los principios que sí publican y calibrar los números contra lo que muestran.

## What Changes

- **BREAKING**: la escala 0–10 pasa a reproducir la de surf-forecast. Las notas bajan: 1,5 m a 12 s limpio pasa de 5 a 3; 2,5 m a 14 s, de 8 a 5.
- **BREAKING**: los niveles del mapa cambian de umbral: pobre 0, aceptable 1–4, excelente 5 o más.
- Parámetros ajustados con validación dejando cada spot fuera: error medio 0,50 y 96% a ±1 estrella.
- Se elimina el recorte por cierre de playa con energía muy alta: surf-forecast no lo aplica y la calibración lo contradice.
- El viento considera las rachas, como recomienda Magicseaweed, sin alterar la calibración en horas de racheo normal.
- Se añade un script de calibración reutilizable para repetir el benchmark con más datos.

## Capabilities

### New Capabilities
<!-- ninguna -->

### Modified Capabilities
- `surf-rating`: la escala se calibra contra surf-forecast; el viento incorpora rachas.
- `condition-rating`: nuevos umbrales de los niveles del mapa.
- `marine-data`: se expone la racha de viento.

## Impact

- `src/services/star-engine.ts`, `src/services/conditions.ts`, `src/services/marine-api.ts`
- `scripts/calibrate-rating.mjs` (nuevo), datos de benchmark en `.cache/benchmark/` (no versionados)
- Tests unitarios y E2E de puntuación y niveles
