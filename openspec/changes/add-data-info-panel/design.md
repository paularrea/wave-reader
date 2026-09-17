## Context

Open-Meteo publica metadatos por modelo en `https://{host}/data/{modelo}/static/meta.json` con `last_run_initialisation_time`, `last_run_availability_time` y `update_interval_seconds`. Los modelos de oleaje responden en `marine-api.open-meteo.com` y los atmosféricos en `api.open-meteo.com`. Comprobado el 2026-09-17: `ecmwf_wam`, `meteofrance_wave`, `dwd_ewam`, `ncep_gfswave025`, `ecmwf_ifs025`, `dwd_icon`, `meteofrance_arome_france_hd`.

## Goals / Non-Goals

**Goals:** que cada dato del panel sea verificable (modelos reales, horas reales) y que la explicación de la nota coincida con el código.
**Non-Goals:** saber qué modelo exacto usó Open-Meteo para un punto concreto (su "best match" no lo expone); comparar modelos (se anuncia, se hará en un change aparte).

## Decisions

### D1 — Ruta de servidor con caché de 10 minutos
`/api/data-status` consulta los metadatos en paralelo y los devuelve normalizados, con `revalidate` de 600 s. Evita siete peticiones por visitante y sigue siendo suficiente: los modelos se actualizan cada 1–12 h. Un modelo que falle se devuelve con `status: 'unavailable'` sin tumbar al resto.

### D2 — Siguiente actualización esperada
`siguiente = last_run_availability_time + update_interval_seconds`. Supone que el retraso entre inicialización y disponibilidad es estable entre ejecuciones, que es lo que se observa. Se presenta como "esperada", no como garantía. Si ya pasó, se muestra "due now".

### D3 — Textos de modelos estáticos, horas dinámicas
Nombre, magnitudes y resolución vienen de la documentación de Open-Meteo y viven en código; las horas vienen de los metadatos. La explicación de la nota cita las constantes exportadas del motor donde es posible para no desincronizarse.

### D4 — Panel como drawer
Mismo patrón que el detalle de spot (Vaul): coherente en móvil y cerrable deslizando.
