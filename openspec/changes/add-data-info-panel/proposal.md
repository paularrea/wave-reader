## Why

El usuario no puede saber de dónde salen los datos, cuándo se actualizan ni cómo se calcula la nota, y eso es lo primero que pregunta alguien acostumbrado a surf-forecast o Surfline antes de fiarse de un parte. Además está previsto comparar varios modelos, y esa comparación necesita un sitio donde explicarse.

## What Changes

- Botón de información pequeño, siempre visible, que abre un panel.
- El panel muestra los modelos meteorológicos y de oleaje que usa Open-Meteo, cuándo corrió cada uno por última vez y cuánto falta para su siguiente actualización, con datos reales de sus metadatos.
- Explica cada cuánto refresca la app sus datos.
- Explica la lógica de la nota, su calibración contra surf-forecast, los niveles del mapa y el aviso de seguridad.
- Explica el origen del catálogo de spots y las limitaciones conocidas (precisión de mareas en costa, sin fondo ni marea en la nota).
- Anuncia la comparación entre modelos como próxima mejora.
- Nueva ruta `/api/data-status` con los metadatos de los modelos.

## Capabilities

### New Capabilities
- `data-transparency`: información sobre fuentes, frecuencia de actualización y lógica de puntuación accesible desde la interfaz.

### Modified Capabilities
<!-- ninguna -->

## Impact

- `src/app/api/data-status/route.ts` (nuevo), `src/services/data-status.ts` (nuevo)
- `src/components/shared/DataInfoPanel.tsx` (nuevo), `src/app/page.tsx`
- Tests unitarios y E2E
