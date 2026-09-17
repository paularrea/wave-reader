## Context

- El detalle pedía `/api/forecast?hour=H` en cada cambio de hora. La respuesta de Open-Meteo ya trae 7 días, así que cada hora repetía la misma llamada aguas arriba solo para extraer otro índice.
- `page.tsx` ignoraba cualquier respuesta con `error` y cualquier excepción: con un 429 (cuota por minuto compartida con la puntuación del mapa desde la IP de Vercel) el detalle se quedaba con guiones para siempre. Además el estado se indexaba solo por spot, así que al cambiar de hora se veía la hora anterior hasta que llegaba la nueva.

## Goals / Non-Goals

**Goals:** ver de un vistazo cuándo mejora un spot; que el detalle cargue siempre o diga por qué no; empezar por hoy; un panel de info escaneable.

**Non-Goals:** integrar Puertos del Estado (bloqueado por licencia, ver abajo); cambiar el rating.

## Decisions

1. **Serie completa en una respuesta** (`/api/forecast/series?spotId&level`). ~169 horas × 15 campos ≈ 40 KB. El rating por hora es barato y se calcula en el servidor para no enviar la configuración del motor al cliente. Alternativa descartada: seguir pidiendo por hora con caché en cliente, que mantiene N peticiones y el problema de la hora anterior.
2. **Reintento en cliente**: un intento y 3 reintentos con esperas de 1,5 s, 4 s y 8 s; después, error visible con botón. La caché de sesión por `spotId|level` evita volver a pedir al reabrir.
3. **Franjas de 3 horas** en horas locales 0, 3, …, 21. La franja parcial de hoy empieza en la hora de anclaje; franjas enteramente pasadas no se dibujan. Cada pill representa su primera hora disponible, que es la hora que se selecciona al pulsarla: así lo que se ve en la pill coincide con lo que abre. 8 pills por día de 12 px de ancho táctil (pill de 8 px) ≈ 105 px por día con separador → 3,3 días en 335 px útiles.
4. **Altura**: altura del swell principal (el valor que el detalle muestra como "Swell"), `4 + min(H,3)/3 × 40` px. **Color**: interpolación lineal de `#52525B` (zinc-600, un paso más claro que el marcador poor para que se lea sobre el fondo del detalle) a `#FBBF24` (marcador epic) con `t = min(stars,5)/5`, para que la pill hable el mismo idioma que el mapa.
5. **Reset al abrir**: `setSelectedSpot(id)` pone `currentHour = 0`. El mapa sigue la hora del detalle (comparten estado), así que también vuelve a hoy; es coherente con lo que se ve.
6. **Panel de info**: tarjetas `bg-zinc-900/60` redondeadas, leyenda como tarjeta destacada con los marcadores reales, fila de accesos rápidos (Conditions, Data, Rating, Safety, More) que hacen scroll a la sección. Todo el contenido sigue renderizado (no acordeones) para que nada quede escondido.

## Puertos del Estado (investigado, no integrado)

- THREDDS público `opendap.puertos.es`: `wave_regional_{aib,bal,can,gib,ibi}` en rejilla lat/lon regular (aib 0,0278° Península+Baleares, bal 0,0139°, can 0,0208°, gib 0,0069°), dos ejecuciones diarias (00 y 12 UTC), 72 h desde la ejecución (≈50–60 h por delante al publicarse). Variables `VHM0`, `VHM0_SW1/SW2/WS`, `VMDR_*` (×0,1), `VSMC_*` (Tm02, ×0,01), `VTPK` (×0,01). OPeNDAP ASCII exige codificar los corchetes.
- Comparado con Open-Meteo en 12 spots: alturas de swell parecidas (±15 %), periodo Tm02 del swell ~7 % mayor. Encajaría con la calibración sin reajuste.
- **Licencia**: el manual del servicio de descarga de datos de Puertos del Estado (2021) dice que solo autoriza el uso para el propósito de la descarga y que en ningún caso se permite la transferencia a terceros, con obligación de citar la fuente. La página de aviso legal de datos abiertos enlazada desde datos.gob.es ya no existe. Mostrar sus datos en una web pública es transferirlos a terceros.
- Alternativa abierta: Copernicus Marine `IBI_ANALYSISFORECAST_WAV_005_005` (modelo del centro IBI, 1/36°, horario, 10 días), con licencia que permite redistribución con atribución; requiere cuenta gratuita de Copernicus Marine.

## Risks / Trade-offs

- Resetear la hora al abrir mueve también el mapa a hoy → aceptado: el usuario lo pidió y la línea temporal muestra los otros días al instante.
- Una respuesta de serie más grande → 40 KB comprimibles, una vez por spot.
