## Context

Motivación y cifras: ver `proposal.md` (Why) y el PRD `openspec/proposals/rating-trust.md`. Requisitos: los cuatro deltas de `specs/`.

Estado actual relevante:

- `star-engine.ts` calcula `stars = min(swellStars, round(energyScore · periodFactor · windFactor))`. El factor de viento recibe `effectiveWindKmh = max(medio, racha / 1,77)` y aplica `1 − onshore/19,28 − cruzado/30,1` a partir de 7,08 km/h. `periodFactor` es una escalera por cuenca.
- `conditions.ts` decide la etiqueta de viento (`Glass` por debajo de 5 km/h) con **su propia constante**, y `verdict.ts` tiene **otra** para "light" (12 km/h). Cada uno de los tres sitios tiene un umbral distinto, y de ahí sale la contradicción.
- La racha llega a `MarineForecast.windGust` y la spec `marine-data` exige exponerla. Solo la consume el motor.
- Los tests unitarios corren en Playwright (`--project=unit`) e importan `src/` directamente. Hay un proyecto opcional con red (`prod`). `jiti` solo está como dependencia transitiva.

## Goals / Non-Goals

**Goals:**
- Una sola constante de calma (10 km/h) compartida por motor, etiqueta y veredicto, para que no puedan volver a separarse.
- Factores de viento y periodo continuos en todas sus entradas.
- Medición de estabilidad reproducible sin añadir dependencias.

**Non-Goals:**
- Cambiar la forma de redondear. `Math.round` sigue produciendo cambios de ±1 en los bordes; eso es resolución, no inestabilidad.
- Dejar de pedir o exponer la racha. Sigue en la API (spec `marine-data`) por si se muestra como dato informativo (P1 del PRD).
- Tocar las anclas de energía, la ventana de swell, la seguridad o `EPIC_THRESHOLD`.

## Decisions

### D1 · Viento: exceso sobre la calma, con el viento medio

```
v       = viento medio (km/h); null → factor 1
x       = max(0, v − 10)                         // CALM_WIND_KMH = 10
onshore = x · max(0, cos θ)                      // θ: dirección respecto al frente del spot
cross   = x · |sin θ|
factor  = clamp(1 − onshore/20 − cross/30, 0, 1)
si v > 45: factor *= max(0, 1 − (v − 45)/30)     // regla de viento fuerte, sin cambios
```

Onshore puro: anula a 10 + 20 = **30 km/h**. Cruzado puro: a 10 + 30 = **40 km/h**. Es continuo en *v* y en θ, y vale 1 en todo el intervalo por debajo de la calma. Se eliminan `effectiveWindKmh` y `TYPICAL_GUST_RATIO`.

- *Por qué restar sobre el exceso y no aplicar la fórmula antigua a partir de 10 km/h:* aplicar `1 − v/19,28` a partir de 10 km/h salta de 1 a 0,48 justo en el umbral. Ese es exactamente el tipo de escalón que produce los saltos.
- *Alternativa descartada, rachas con un ratio que dependa de la velocidad:* no hay evidencia de que las rachas empeoren el surf con viento moderado, y la regla actual se midió solo por encima de 8 km/h. Queda como P2 del PRD.
- *Alternativa descartada, mantener la pendiente antigua desplazada (opción A):* deja 20 km/h onshore en 1 sobre un mar de 7, frente a 4 con esta pendiente. Wavey considera "tolerable" el onshore de hasta 15 km/h.

### D2 · Periodo: interpolación lineal por puntos, por cuenca

`SCALES[basin].period` pasa de escalones `{under, factor}` a puntos `[periodoS, factor]` interpolados linealmente, con valor constante fuera del primer y del último punto:

| Cuenca | Puntos | Fuera de rango |
|---|---|---|
| Atlántico | (5; 0,48) · (7; 0,69) · (9; 0,71) · (10; 1,0) | 0,48 por debajo de 5 s · 1,0 a partir de 10 s |
| Mediterráneo | (4,5; 0,4) · (5,5; 0,8) · (6; 1,0) | 0,4 por debajo de 4,5 s · 1,0 a partir de 6 s |

Cada punto está en el centro del escalón que sustituye, y el último cae en el periodo de las anclas, para que las anclas sigan puntuando exactamente lo que declaran. El chop mediterráneo de 1,0 m @ 4 s da una puntuación base de 0,56 × 0,4 = 0,2, que redondea a 0, así que el escenario de la spec se mantiene.

- *Alternativa descartada, llegar a 1,0 en 11 s (la curva de la decisión inicial):* deja 1,4 m @ 10 s en 6 y contradice el ancla. Se detectó al redactar las specs.
- *Alternativa descartada, eliminar la penalización de 8–10 s (la meseta 0,69 → 0,71):* es un artefacto del ajuste antiguo, pero quitarla sube todos los días de 8–9 s, que son muy comunes en el Atlántico, y se sale del alcance decidido. Se deja tal cual.

### D3 · Una sola fuente para el umbral de calma

`CALM_WIND_KMH = 10` se exporta desde `star-engine.ts` y lo importan `conditions.ts` (etiqueta `Light`) y `verdict.ts` ("light"). `GLASS_THRESHOLD_KMH = 5` se queda en `conditions.ts` porque es solo de presentación y siempre está por debajo de la calma.

- *Alternativa descartada, duplicar la constante con un comentario:* es exactamente como se separaron los tres umbrales actuales.

### D4 · Etiqueta y vocabulario

- `WindCategory = 'Glass' | 'Light' | 'Offshore' | 'Cross-shore' | 'Onshore'`. `Light` usa los mismos colores que `Glass`: el verde es el mensaje "el viento no cuesta", y no hace falta un matiz nuevo.
- Orden de decisión en `windBadge`: sin dato → `null`; < 5 → `Glass`; < 10 → `Light`; si no, por dirección (como ahora). La dirección solo se necesita a partir de 10 km/h.
- El veredicto toma el nombre de calidad del nivel (`qualityStyle(...).label`: Epic / Fair / Poor), con `Flat` y `Blown out` como casos concretos de Poor. Fuerza del viento: light < 10 ≤ moderate < 25 ≤ strong. Con `Light`, la frase conserva la dirección ("light onshore wind"), porque "light" ya dice que no resta.
- Leyenda del panel (`TIER_MEANING`): epic deja de decir "Rare. Go." (ahora es el 29 % de las horas) y pasa a *"Worth the drive"*; good pierde "Surfable" y queda *"Worth a look"*.

### D5 · Detalle del spot

Se elimina el `<span data-testid="spot-potential">` de `SpotDetailDrawer`. `swellStars` se sigue calculando y enviando en el lote y en la serie, porque el mapa lo usa.

### D6 · Medición reproducible como proyecto opcional de Playwright

`tests/measure/rating-stability.spec.ts`, con un proyecto `measure` en `playwright.config.ts` que queda fuera de la ejecución por defecto (como `prod`) y un script `npm run test:measure`.
- Usa `getMarineHorizonBatch`, `spotsOfRegion` y el motor reales sobre las 5 regiones de la spec.
- Guarda las respuestas de Open-Meteo en `.cache/rating-trust/` (ya ignorada por git), así que repetir la medición no cuesta cuota.
- Imprime las métricas (saltos ≥3, horas `Glass`/`Light` penalizadas, histograma por cuenca) y comprueba los umbrales de las specs.

Los scripts de investigación de `openspec/proposals/rating-trust-evidence/` se quedan como registro.

- *Alternativa descartada, script `.mjs` en `scripts/`:* tendría que reimplementar el motor en JS, como hace `calibrate-rating.mjs`, o depender de `jiti`, que es transitivo. Playwright ya compila TS e importa `src/`.
- *Alternativa descartada, meterlo en `unit`:* depende de la red y de la previsión del día, así que no es determinista.

### D7 · Garantía determinista en unit

`surf-rating.spec.ts` añade un barrido en rejilla (altura 0,3–3 m; periodo 4–16 s; viento 0–40 km/h; dirección cada 10°) que exige que un paso por debajo de lo que el surfista distingue en pantalla (+0,1 m, +0,5 s, +3 km/h o +10° de dirección) mueva la nota como mucho 2. Comprobado sobre el modelo nuevo: el máximo es exactamente 2 en cada dimensión. Con pasos de dirección de 45° el máximo llega a 7 (39 km/h cross-offshore frente a offshore puro), pero 45° es más que el error del modelo y no es "casi igual". Además, tests de continuidad en torno a 10 km/h y a 10 s, y los guardarraíles de R3 como casos exactos. Esto protege la propiedad sin depender del pronóstico.

### D8 · Migración de tests

- `surf-rating.spec.ts`: se eliminan los casos de `effectiveWindKmh` y del racheo, y se sustituyen por "las rachas no puntúan". Los casos con viento onshore de 8–19 km/h cambian de valor esperado según D1.
- `conditions.spec.ts`: etiquetas con el nombre nuevo y casos de `Light`.
- `verdict-and-summary.spec.ts`: "Surfable" → "Fair" y "Excellent" → "Epic".
- `forecast-flows.spec.ts` (E2E): `Off-shore` / `On-shore` → `Offshore` / `Onshore`. Las aserciones de `spot-potential` se sustituyen por "no existe" en ambos casos, y se añade un caso de `Light`.

## Risks / Trade-offs

- **[Escala más alta: media atlántica de 2,2 a 3,9, epic del 10 % al 29 % en la semana medida]** → Aceptado por el PM como corrección. Se revalida con `test:measure` en la primera semana de temporal y se documenta la distribución.
- **[Una sola semana de evidencia y mucho viento flojo]** → La misma revalidación; el proyecto `measure` se puede repetir en cualquier momento.
- **[Mediterráneo sin evidencia (semana plana)]** → Afectado por D1 y D2. Los escenarios mediterráneos de la spec se comprueban en unit, y la revalidación lo mira aparte.
- **[Un onshore real de 12–15 km/h puntúa más que antes (mar de 7 → 6–5 en lugar de 3–2)]** → Es lo que se busca (Wavey: "tolerable" hasta 15 km/h); el veredicto nombra "moderate onshore wind", así que el surfista ve el motivo.
- **[Los redondeos siguen dando ±1 entre horas]** → Fuera de alcance (Non-Goal); la métrica solo cuenta saltos ≥3.
- **[Caché con notas antiguas tras el despliegue]** → El edge caduca en ≤30 min (lote) o a la hora siguiente (serie), y la caché de sesión en 30 min. Durante esa ventana puede haber mezcla de escalas, pero es aceptable.

## Migration Plan

1. Implementar motor (D1, D2, D3) y tests unitarios (D7, D8) → `npm run test:unit`.
2. Etiqueta, veredicto, detalle y panel (D4, D5) → `npm run test:e2e`.
3. `test:measure` sobre las 5 regiones: saltos ≥3 ≤0,1 % y 0 % de horas `Glass`/`Light` penalizadas.
4. Actualizar `CLAUDE.md` (Star Engine, Conditions) y el panel en el mismo commit.
5. Desplegar. Sin migración de datos ni de contrato. **Rollback:** revertir el commit; las cachés caducan solas.

## Línea base tras implementar (21-09-2026)

Salida de `npm run test:measure` con el código implementado y la previsión del día (334 spots, 57.114 horas puntuadas, 18 llamadas a Open-Meteo):

```
jumps >= 3 between look-alike hours: 0.01 % (3/45982)      antes: 1,60 % (Atlántico)
Glass/Light hours losing points to wind: 0.0 % (0/33899)  antes: 29–34 % de las horas Glass
atlantic mean 3.81 · epic (>=6) 29 %                       antes: 2,17 · 10 %
atlantic      0:16% 1:8% 2:10% 3:12% 4:13% 5:13% 6:11% 7:9% 8:5% 9:3% 10:0%
mediterranean 0:100% (semana plana: sin evidencia, revalidar con mar)
```

Es la referencia para la revalidación en la primera semana de temporal (riesgo 1) y para el Mediterráneo en cuanto haya mar.

## Open Questions

- ¿Se muestra la racha como dato informativo en la tarjeta de viento? Es P1 del PRD, no cambia specs ni tareas de este change.
