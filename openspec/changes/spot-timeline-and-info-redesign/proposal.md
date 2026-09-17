## Why

El detalle de un spot obliga a ir hora a hora para descubrir cuándo mejora el parte: hoy gris, pasado mañana amarillo, pero eso no se ve sin navegar. Además el detalle a veces se queda sin datos: pide la previsión en una llamada por hora, descarta en silencio cualquier error (un 429 de Open-Meteo, compartido con la puntuación del mapa) y deja el panel con guiones. Al abrir un spot se hereda el día que estaba seleccionado en el mapa, cuando lo esperado es empezar por hoy. El panel de información, con la leyenda de condiciones ahora dentro, es un bloque largo de texto difícil de escanear.

Puertos del Estado se estudió como fuente de oleaje para España (servidor THREDDS público, mallas regionales de 0,7–3 km, 72 h). Sus condiciones de uso solo autorizan el uso para el propósito de la descarga y prohíben la transferencia a terceros, que es lo que haría una web pública. Queda fuera de este change a la espera de decisión (autorización expresa o Copernicus Marine IBI, que es abierto).

## What Changes

- Nueva ruta `/api/forecast/series` que devuelve en una sola llamada la previsión horaria de los 7 días de un spot, con la puntuación, el aviso de seguridad y las mareas de cada día.
- El detalle carga la serie una vez por spot y nivel, navega entre horas sin volver a pedir datos, reintenta con espera creciente si falla, y muestra un estado de carga y un error con opción de reintentar en lugar de guiones mudos.
- Línea temporal de pills verticales en el detalle: una pill por franja de 3 horas, altura según el tamaño de ola (0–3 m, sin crecer por encima de 3 m) y color de gris a amarillo según la nota. En móvil caben al menos 3 días; se desplaza horizontalmente hasta el horizonte. Sustituye a las pestañas de día; se mantiene el paso hora a hora.
- Al abrir un spot, el forecast vuelve a la primera hora de hoy.
- Panel de información rediseñado en tarjetas, con la leyenda de condiciones en una tarjeta destacada al principio y accesos rápidos a cada sección.

## Capabilities

### New Capabilities
<!-- ninguna -->

### Modified Capabilities
- `drawer-navigation`: línea temporal de pills, reset a hoy al abrir, carga fiable con reintento y estado de error.
- `data-transparency`: presentación en tarjetas con accesos rápidos y leyenda destacada.
- `marine-data`: serie horaria completa por spot en una sola llamada.

## Impact

- `src/services/marine-api.ts`, nueva `src/app/api/forecast/series/route.ts`, nuevo `src/services/forecast-series.ts` (franjas y colores de la línea temporal).
- `src/app/page.tsx`, `src/components/shared/SpotDetailDrawer.tsx`, nuevo `ForecastTimeline.tsx`, `DataInfoPanel.tsx`, `src/store/useStore.ts`.
- Tests unitarios de franjas/colores y E2E del detalle, el reset y el panel; smoke test de producción.
