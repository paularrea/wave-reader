## Why

La interfaz funciona pero no pone el foco en lo importante (dónde y cuándo hay olas) y falla en básicos de usabilidad: el botón de info y el selector de nivel miden menos de 44 px, hay etiquetas de 10 px en mayúsculas con poco contraste, el azul de marca compite con el amarillo de la nota, dos desplegables nativos ocupan el panel inferior y `globals.css` fuerza Arial por encima de Geist. El diseño aprobado está en https://claude.ai/artifact/DaKvq44utPzrFcqztPEDyx.

## What Changes

- Sistema visual: fondo, hoja y tarjeta oscuros; amarillo solo para calidad; blanco para acciones; Geist real; nada por debajo de 12 px; objetivos táctiles de 44 px.
- Barra superior: pastilla de región (abre un selector con búsqueda, "usar mi ubicación", pestañas por país y lista de regiones), chip de nivel (abre un selector que explica que solo afecta a las alertas) y botón de info.
- Botón para centrar en mi ubicación y estado vacío "No spots in view".
- Panel inferior: "Best in view" con los tres mejores spots visibles a la hora elegida, tira de días con la mejor nota del día en la zona visible, hora, "Back to now" y slider.
- El mapa pide cada lote con **todo el horizonte** (7 días) en lugar de una hora: mover el slider ya no hace peticiones y permite calcular los mejores spots y días.
- Detalle de spot: veredicto en una frase, mejor franja del día, tarjetas de swell/periodo/viento, marea como curva con la hora marcada, detalles del estado del mar plegables y acción "Directions".
- Panel de info con el nuevo estilo.

## Capabilities

### Modified Capabilities
- `responsive-layout`, `region-selection`, `drawer-navigation`, `condition-rating`, `marine-data`.

## Impact

`globals.css`, `page.tsx`, `MarineMap.tsx`, `SpotDetailDrawer.tsx`, `ForecastTimeline.tsx`, `DataInfoPanel.tsx`, nuevos `RegionPicker.tsx`, `LevelPicker.tsx`, `services/verdict.ts`, `services/map-summary.ts`; `/api/forecast/batch` y `marine-api.ts`; store; tests unitarios y E2E.
