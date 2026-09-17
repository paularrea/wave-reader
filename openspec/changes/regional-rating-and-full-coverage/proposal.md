## Why

Tres problemas visibles en producción. En Cataluña el mapa dibujaba 300 spots y solo puntuaba 106: el resto quedaba "sin datos" para siempre, porque el mapa puntúa como mucho 60 spots por vista. El Mediterráneo sale siempre gris: la escala calibrada contra surf-forecast es atlántica, y un 1,5 m a 8 s sin viento, que en el Mediterráneo es un buen día, puntúa 0. Y la leyenda ocupa la cabecera en móvil. Además faltan Francia y Reino Unido.

## What Changes

- **BREAKING**: la puntuación depende de la cuenca. El Mediterráneo usa su propia escala: 1 m a 7 s con viento cross-off o plancha ronda 2–3 estrellas y 1,5 m a 8 s sin viento 5–6.
- El mapa puntúa todos los spots de la vista mediante una ruta por lotes que agrupa hasta 50 spots por petición al proveedor, con lotes estables para aprovechar la caché.
- Un spot solo se dibuja cuando tiene puntuación; los que no tienen datos no aparecen.
- El catálogo descarta los spots para los que el modelo de oleaje no devuelve datos.
- Se incorporan Francia (metropolitana y ultramar) y Reino Unido; Inglaterra se divide por condados.
- La descarga del catálogo se verifica contra un recuento antes de aceptarse: una región volvió con 150 de 507 playas sin ningún aviso.
- La leyenda de niveles pasa al panel de información, como primera sección.

## Capabilities

### Modified Capabilities
- `surf-rating`: escala específica para el Mediterráneo.
- `region-selection`: puntuación de todos los spots visibles; spots sin datos ocultos.
- `spot-catalog`: descarte de spots sin datos y verificación de descarga completa.
- `condition-rating`: la leyenda vive en el panel de información.

## Impact

- `src/services/star-engine.ts`, nuevo `src/services/basins.ts`
- `src/services/marine-api.ts` (lotes), nueva ruta `/api/forecast/batch`
- `src/components/shared/MarineMap.tsx`, `DataInfoPanel.tsx`, `src/app/page.tsx`
- `scripts/fetch-osm-beaches.mjs`, `scripts/derive-spot-config.mjs`, catálogo regenerado
