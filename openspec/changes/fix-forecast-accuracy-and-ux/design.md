## Context

La app ya tiene mapa, drawer, motor de estrellas y ruta `/api/forecast`. El cambio no reescribe la arquitectura: corrige el origen de los datos, añade dos cálculos nuevos (mareas y tiempo/zona horaria) y ajusta la capa visual. La restricción dominante es que Open-Meteo reparte las magnitudes entre dos endpoints distintos y que el catálogo de spots actual no es confiable.

## Goals / Non-Goals

**Goals**
- Que ningún dato mostrado sea inventado o derivado de un `null` silencioso.
- Que el catálogo sea reproducible: regenerable desde un script con procedencia auditable.
- Que cada escenario de los specs tenga un test E2E que lo cubra.

**Non-Goals**
- No se añade base de datos ni persistencia; el catálogo sigue siendo un JSON en el repo.
- No se amplía la cobertura geográfica; se corrige la existente, aunque eso reduzca el número de spots.
- No se introduce modelo propio de mareas armónicas; se derivan de la serie de nivel del mar de Open-Meteo.

## Decisions

### D1 — Dos endpoints de Open-Meteo, fusionados por marca de tiempo
`marine-api.open-meteo.com/v1/marine` sirve oleaje y nivel del mar; `api.open-meteo.com/v1/forecast` sirve viento. Se piden en paralelo con el mismo rango de fechas y `timezone=auto`, y se fusionan indexando por la marca de tiempo, no por posición de array.

*Por qué por marca de tiempo:* los dos endpoints pueden devolver rangos distintos si uno recorta el horizonte. Indexar por posición produciría un desfase silencioso de horas — exactamente la clase de error que este cambio existe para eliminar.

*Alternativa descartada:* seguir con un solo endpoint y estimar el viento. Inaceptable: era el bug original.

### D2 — `timezone=auto` en lugar de una librería de zonas horarias
Open-Meteo acepta `timezone=auto` y devuelve `timezone`, `timezone_abbreviation` y `utc_offset_seconds` resueltos desde las coordenadas consultadas. Se usa eso como fuente de zona horaria del spot.

*Por qué:* evita añadir una dependencia de base de datos de zonas horarias al bundle, y garantiza que la hora que muestra la UI es la misma con la que el proveedor etiqueta sus series. Con `timezone=auto` las series ya vienen en hora local del spot, lo que elimina toda aritmética de offset manual.

### D3 — El instante seleccionado se guarda como offset horario absoluto, se formatea en local del spot
El store guarda un desplazamiento entero en horas desde la hora en punto siguiente a la actual. La conversión a etiqueta legible ocurre en el momento de pintar, usando el `utc_offset_seconds` del spot en foco; sin spot seleccionado se usa el de la geolocalización del usuario.

*Por qué:* mantiene la línea temporal como un control global único (un solo slider para todos los marcadores del mapa) pero cumple el requisito de que la hora mostrada sea la local del spot.

### D4 — Mareas por extremos locales de la serie horaria
Se recorre la serie `sea_level_height_msl` y se marca como pleamar todo punto mayor que sus vecinos y como bajamar todo punto menor. Se filtran los extremos cuya prominencia respecto al extremo contiguo sea inferior a 10 cm, para no reportar ruido del modelo como marea.

*Limitación aceptada:* la resolución es horaria, así que la hora del extremo tiene una precisión de ±30 min. Se documenta en la UI en vez de fingir precisión al minuto.

### D5 — Catálogo generado por script, salida commiteada
`scripts/build-spot-catalog.mjs` toma la lista de nombres de spots, los resuelve contra Nominatim, valida la elevación contra la API de elevación de Open-Meteo y escribe `src/data/spots.json` con un bloque `provenance` por spot. El script se ejecuta a mano, no en build.

*Por qué no en build:* Nominatim exige límite de una petición por segundo y prohíbe uso automatizado pesado; un build de Vercel no debe depender de él. La salida commiteada mantiene el build hermético.

*Consecuencia:* los spots que Nominatim no resuelva a un tipo costero se descartan. El catálogo encoge, y eso es el resultado correcto: 12 de los 61 actuales son relleno con coordenadas copiadas.

### D6 — Ausencia de dato como `null` explícito hasta la capa de presentación
Los tipos del forecast usan `number | null`. Ninguna capa intermedia aplica `?? 0`. La UI decide cómo mostrar la ausencia.

*Por qué:* el bug de `0 km/h` nació de coaccionar un ausente a número en la capa de servicio. Prohibirlo por tipo lo hace irrepetible.

## Risks / Trade-offs

- **El catálogo encoge y quizá bastante.** Mitigación: el script deja constancia de cada descarte con su motivo, de modo que reincorporar un spot es cuestión de aportar su coordenada verificada, no de reinventarla.
- **Doblamos las llamadas externas por spot.** Mitigación: la caché existente en la ruta pasa a incluir el nivel del surfista en su clave (hoy no lo hace, lo que ya era un bug de cacheo cruzado) y se comparte entre ambos endpoints con el mismo TTL.
- **Nominatim puede devolver un homónimo tierra adentro.** Mitigación: la validación de elevación y de tipo costero rechaza la mayoría; lo que pase el filtro y siga siendo erróneo se detecta en revisión manual del diff del catálogo.

## Migration Plan

1. Generar el catálogo nuevo y revisar el diff antes de commitearlo.
2. Desplegar servicios y UI juntos: un catálogo con `provenance` y una UI vieja no rompen, pero una UI nueva con catálogo viejo mostraría spots sin procedencia.
3. No hay datos de usuario persistidos, así que no hay migración de estado.

## Open Questions

- Ninguna bloqueante. Si tras la regeneración el catálogo baja de ~20 spots, conviene decidir si se amplía la lista semilla antes de desplegar.
