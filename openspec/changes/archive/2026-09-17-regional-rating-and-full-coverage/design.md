## Context

Diagnóstico en producción, Cataluña: 300 marcadores, 106 puntuados, 194 huecos tras 30 s. Las peticiones individuales y en ráfaga devolvían 200: el vacío lo causaba el tope `MAX_SPOTS_PER_VIEWPORT = 60`. Open-Meteo acepta varias coordenadas por petición: 50 spots para una hora son 45 KB y 0,28 s.

## Decisions

### D1 — Lotes estables por región
Los spots de cada región se ordenan de forma fija y se agrupan en lotes de 50. El mapa calcula qué lotes contienen spots visibles y pide `/api/forecast/batch?region=R&chunk=N&hour=H&level=L`. Cada lote hace 2 peticiones al proveedor (oleaje y viento) para una sola hora UTC. Las URLs aguas arriba son idénticas para todos los usuarios en la misma hora, así que la caché de datos de Next las reutiliza. Las mareas no se piden en lote: solo las necesita el detalle, que sigue usando `/api/forecast`.

### D2 — Sin marcadores huecos
Un marcador se crea cuando llega su puntuación. Un spot sin datos no se dibuja. Durante la carga se mantiene el indicador de puntuación.

### D3 — Cuenca por coordenadas
Mediterráneo si latitud entre 34 y 46, longitud mayor que −5,61 (estrecho de Gibraltar), y no está en el golfo de Vizcaya o el canal de la Mancha (latitud ≥ 43,2 con longitud < 1,5). Evita regenerar el catálogo y aplica igual a spots futuros.

### D4 — Escala mediterránea
No hay un servicio de referencia con escala mediterránea, así que se calibra contra los anclajes del usuario, que conoce esas condiciones:

| Mar (sin viento) | Energía | Objetivo | Resultado |
|---|---|---|---|
| 0,3 m @ 4 s | 3 kJ | 0 | 0 |
| 1 m @ 7 s | 93 kJ | 2–3 | 3 |
| 1 m @ 7 s, cross-off 15 km/h | 93 kJ | 2–3 | 2 |
| 1,5 m @ 8 s | 274 kJ | 5–6 | 6 |
| 2 m @ 9 s | 616 kJ | — | 8 |

Parámetros: plano bajo 5 kJ, 10 a 1.500 kJ, gamma 1,6; periodo ×0,6 bajo 5 s, ×0,85 bajo 6 s. El viento conserva la calibración atlántica: la energía cambia de escala entre mares, el efecto del viento sobre la ola no.

### D5 — Filtro de datos en el catálogo
Tras derivar la exposición, se consultan en lotes de 50 las coordenadas del catálogo contra el modelo de oleaje para una hora; los spots con altura nula se descartan con motivo `no wave model data`.

## Risks / Trade-offs

- **La escala mediterránea no está validada contra un servicio.** Se basa en criterio experto. Mitigación: los anclajes quedan como tests y el script de calibración puede incorporar datos si aparecen.
- **Frontera de cuenca por reglas geográficas.** Correcta para las costas del catálogo; habría que revisarla si se añaden Italia o el Adriático.
