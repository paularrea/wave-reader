# Escala surfeable, catálogo curado y selector de país

## Why

Tres problemas reportados tras probar la app contra surf-forecast:

1. **La nota va baja en el Atlántico y alta en el fondo del Mediterráneo.** El
   motor está calibrado contra la escala de estrellas de surf-forecast, que es
   una escala global: en ella 1,4 m a 10 s con offshore flojo es un 2. Para
   alguien que decide si va a surfear hoy a su playa, eso es un día bueno y
   debe leerse como tal. En el Mediterráneo pasa lo contrario: 0,4 m a 4 s
   aparece con nota cuando no hay ola que surfear.

2. **El catálogo no son spots de surf.** 600 puntos en Cataluña contra los 29
   que lista surf-forecast. OSM etiqueta toda playa urbana; muchas comparten
   celda del modelo y ninguna rompe. Dar previsión de surf donde no hay ola es
   el peor error de producto que puede cometer la app.

3. **El selector de país es una fila de chips.** Con cuatro países cabe; con
   quince, no.

## What Changes

- **Escala de surfeabilidad por anclas.** Se abandona el ajuste a las estrellas
  de surf-forecast como objetivo. La nota pasa a medir *cómo de bueno es el
  baño*, anclada a condiciones que un surfista reconoce. Se mantiene intacta la
  física (energía, dirección, periodo, viento); cambia solo la curva que
  traduce energía en nota, ahora explícita y auditable.
- **Suelo real en el Mediterráneo**: el chop de menos de 5 s deja de puntuar.
- **Catálogo curado**: un spot representa un tramo de costa surfeable, no cada
  playa etiquetada. Filtro por exposición, por tipo de lugar (puertos, dársenas
  y clubes náuticos fuera) y deduplicación por tramo de costa a la resolución
  del modelo, más una lista curada de breaks conocidos que siempre sobreviven y
  dan nombre a su tramo.
- **Un JSON por país** más un índice ligero por país, cargado bajo demanda: hoy
  el navegador se descarga el índice de los 7.870 spots aunque el surfista mire
  una sola región.
- **Selector de país como desplegable buscable**, no chips.

## Impact

- Specs: `surf-rating`, `spot-catalog`, `region-selection`
- Código: `services/star-engine.ts`, `services/basins.ts`, `services/regions.ts`,
  `components/shared/RegionPicker.tsx`, `DataInfoPanel.tsx`, rutas de forecast,
  `scripts/curate-spots.mjs` (nuevo), `src/data/spots/*`
- Datos: el catálogo publicado se reduce de 7.870 a los spots que de verdad se
  surfean; cada descarte queda registrado con su motivo.

## Non-goals

- No se cambia la fuente de datos (Open-Meteo sigue siendo la fuente).
- No se integra Puertos del Estado (licencia, ya analizado).
- No se reescribe la física del rating, solo la escala de salida.
