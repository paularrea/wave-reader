## Why

La nota salta de 3 a 6 estrellas entre horas o spots cuyo pronóstico en pantalla es idéntico. Pasa en el 1,6 % de los pares de horas consecutivas y en el 15,7 % de los días-spot atlánticos. Además, el 29–34 % de las horas etiquetadas `Glass` pierden puntos por viento. El 95 % de esos saltos viene del viento. Se puntúa con un viento efectivo inflado por las rachas, que la UI no muestra, y ese viento pasa por un umbral duro (7,08 km/h) y una pendiente onshore que anula el surf a 19 km/h. Las dos constantes se heredaron de un ajuste a datos de surf-forecast de baja resolución (notas 0–4, viento en pasos de 5 km/h) y luego se aplicaron sobre la escala 0–10. Con una nota que contradice a su propia etiqueta, el surfista acaba contrastando en otra app, y el primero en hacerlo es el PM.

Evidencia, benchmark y simulación de alternativas: `openspec/proposals/rating-trust.md` y `openspec/proposals/rating-trust-evidence/`.

## What Changes

- **Viento sin rachas**: el factor de viento usa el viento medio, el mismo que se muestra. **BREAKING** para la nota: desaparece `max(medio, racha / 1,77)`.
- **Viento flojo sin coste**: por debajo de 10 km/h el viento no resta en ninguna dirección. Por encima, la penalización crece de forma continua desde cero, sin escalón.
- **Pendiente onshore más suave**: el onshore puro anula el surf a 30 km/h y el cruzado a 40 km/h, medidos sobre el exceso por encima de la calma. La regla de viento fuerte (45 → 75 km/h) no cambia.
- **Periodo continuo**: el factor de periodo deja de ser una escalera y pasa a ser una curva monótona. Se conservan los valores de referencia y el chop mediterráneo sigue puntuando 0.
- **Etiqueta de viento `Light`** (verde) de 5 a 10 km/h. Con etiqueta `Glass` o `Light`, el viento nunca resta.
- **Un solo vocabulario**: onshore / offshore / cross-shore en toda la UI, y un nombre por nivel (Epic / Fair / Poor) en el recuadro de la nota y en el veredicto. En el veredicto, "light" pasa a significar menos de 10 km/h.
- **Se retira del detalle** la línea "Swell alone X/10 · wind costs Y". La puntuación potencial se sigue calculando y exponiendo, porque la usa el mapa.
- **Consecuencia aceptada en la escala**: la nota media atlántica sube de 2,2 a 3,9 y los marcadores epic pasan del 10 % al 29 % de las horas. Las anclas y el umbral de epic (6) no cambian.
- **Medición reproducible**: script versionado con las métricas de estabilidad y coherencia, más tests de continuidad y de guardarraíles.
- Texto del panel de información y sección *Star Engine* de `CLAUDE.md`, actualizados en este mismo change.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `surf-rating`: el viento se evalúa con el viento medio y sin umbral duro, con calma por debajo de 10 km/h y pendiente onshore/cruzada más suave (sustituye el requisito de rachas); el periodo corto penaliza de forma continua; la puntuación potencial se expone pero el detalle ya no está obligado a mostrar la diferencia; nuevo requisito de estabilidad (entradas casi iguales dan notas casi iguales).
- `condition-rating`: la etiqueta de viento gana la categoría `Light` y usa la ortografía onshore / offshore / cross-shore; los niveles de calidad tienen un único nombre (Epic / Fair / Poor). *Corrección de deriva:* los umbrales pasan a ser los del código (epic 6–10, fair 1–5), que el change anterior cambió sin actualizar la spec.
- `drawer-navigation`: el veredicto usa "light" solo por debajo de 10 km/h (cuando el viento no resta), nombra dirección y fuerza cuando sí resta, y usa los nombres de nivel únicos; el detalle deja de mostrar la línea de puntuación potencial.
- `data-transparency`: la sección de puntuación explica el viento tal y como se calcula ahora. *Corrección de deriva:* deja de exigir la "calibración contra surf-forecast y su error medio", porque la escala se define por anclas propias desde el change anterior.

## Impact

- **Código**: `src/services/star-engine.ts` (viento, periodo, se elimina el ratio de rachas), `src/services/conditions.ts` (etiqueta `Light`, ortografía, nombres de nivel), `src/services/verdict.ts` (umbral de "light", nombres de nivel), `src/components/shared/SpotDetailDrawer.tsx` (se retira la línea de potencial), `src/components/shared/DataInfoPanel.tsx` (texto).
- **Datos y API**: sin cambios de contrato. `/api/forecast/batch` y `/api/forecast/series` devuelven los mismos campos con valores nuevos. Las cachés del edge caducan solas (≤30 min y hasta la hora siguiente).
- **Tests**: los escenarios unitarios del motor que dependen de las constantes antiguas; los E2E que buscan `On-shore`, `Off-shore`, `Excellent`, `Surfable` o `spot-potential`.
- **Docs**: `CLAUDE.md` (Star Engine, Conditions), specs `surf-rating`, `condition-rating`, `drawer-navigation` y `data-transparency`.
- **Sin tocar**: catálogo de spots y change `named-breaks-survive-curation` (en curso en paralelo), anclas de energía, `EPIC_THRESHOLD`, lógica de la cuenca mediterránea salvo lo que comparte de viento y periodo.
