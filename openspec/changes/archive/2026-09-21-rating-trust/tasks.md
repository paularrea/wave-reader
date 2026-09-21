## 1. Motor de puntuación

- [x] 1.1 Exportar `CALM_WIND_KMH = 10` desde `src/services/star-engine.ts` y reescribir `windFactor` según D1: exceso sobre la calma, onshore que anula a 30 km/h y cruzado a 40, regla de viento fuerte sin cambios. Verificar con tests unitarios: onshore a 2, 5 y 10 km/h sobre un mar de 7 → 7; 15 → 5; 20 → 4; 25 → 2 (±1); 30 → 0; offshore a 15 km/h = potencial; más de 75 km/h → 0; viento nulo = potencial.
- [x] 1.2 Eliminar `effectiveWindKmh` y `TYPICAL_GUST_RATIO`, y hacer que `calculateStarRating` pase el viento medio a `windFactor`. Verificar con un test "las rachas no puntúan" (mismo viento medio, rachas 1,77× y 4× → misma nota) y con un `grep` sin resultados de `effectiveWindKmh` en `src/` y `tests/`.
- [x] 1.3 Cambiar `SCALES[basin].period` a puntos `[periodoS, factor]` interpolados linealmente (D2: Atlántico (5; 0,48)·(7; 0,69)·(9; 0,71)·(10; 1,0); Mediterráneo (4,5; 0,4)·(5,5; 0,8)·(6; 1,0)). Verificar con tests: 2,2 m @ 9,9 s y @ 10,1 s difieren ≤1; 1,4 m @ 10 s puntúa igual que a 12 s con la misma energía; 3 m @ 6 s < 1,5 m @ 12 s; Mediterráneo 1,0 m @ 4 s en calma → 0.
- [x] 1.4 Reescribir los casos de `tests/unit/surf-rating.spec.ts` que dependían de las constantes antiguas y de las rachas (D8), y comprobar que siguen pasando los escenarios existentes de anclas, Mediterráneo (incluido cross-off de 15 km/h entre 2 y 4), ventana de swell, mar plano y sin datos. Verificar con `npm run test:unit -- tests/unit/surf-rating.spec.ts` en verde.
- [x] 1.5 Añadir el barrido de continuidad de D7 (rejilla de altura, periodo, viento y dirección cada 10°; un paso de +0,1 m, +0,5 s, +3 km/h o +10° mueve la nota ≤2) y un caso de onshore de 9 → 11 km/h sobre un mar de 7 que baje ≤1. Verificar con el test en verde.

## 2. Etiqueta de viento y vocabulario

- [x] 2.1 En `src/services/conditions.ts`: `WindCategory` pasa a `'Glass' | 'Light' | 'Offshore' | 'Cross-shore' | 'Onshore'`; `Light` (5–10 km/h, colores de `Glass`) usando `CALM_WIND_KMH`; ortografía sin guion. Verificar en `tests/unit/conditions.spec.ts`: 3 km/h → `Glass`; onshore a 7 km/h → `Light`; onshore a 12 km/h → `Onshore`; offshore a 12 km/h → `Offshore`; viento nulo → `null`.
- [x] 2.2 Añadir un test que recorra una rejilla de viento y dirección y compruebe que con etiqueta `Glass` o `Light` la puntuación es siempre igual a la potencial. Verificar con el test en verde.
- [x] 2.3 En `src/services/verdict.ts`: "light" por debajo de `CALM_WIND_KMH` (moderate <25, strong ≥25), direcciones onshore / offshore / cross-shore, conservar la dirección con `Light`, y nombre de calidad tomado del nivel (Epic / Fair / Poor, con Flat y Blown out). Verificar en `tests/unit/verdict-and-summary.spec.ts`: 1,3 m @ 7 s con onshore de 7 km/h → frase con "light onshore"; 1,4 m @ 12 s con onshore de 18 km/h → "moderate onshore"; nota 7 → empieza por "Epic".

## 3. Interfaz

- [x] 3.1 Quitar el `<span data-testid="spot-potential">` de `src/components/shared/SpotDetailDrawer.tsx`, sin tocar `swellStars` en los datos. Verificar con el E2E: el detalle de un spot con viento que resta no contiene `spot-potential`.
- [x] 3.2 Actualizar `src/components/shared/DataInfoPanel.tsx`: el texto de viento dice que se usa el viento medio, que las rachas no cuentan, que por debajo de 10 km/h no resta y que onshore y cross-shore restan de forma progresiva; la leyenda (`TIER_MEANING`) dice epic "Worth the drive" y good "Worth a look"; ninguna mención a calibración contra un servicio de terceros. Verificar con un E2E sobre la sección `info-rating` que busque "gusts" / "10 km/h" y no encuentre "calibrated".
- [x] 3.3 Migrar `tests/e2e/forecast-flows.spec.ts` (D8): etiquetas `Offshore` / `Onshore`, un caso nuevo de `Light`, y comprobar que no aparece ningún texto visible con `On-shore`, `Off-shore`, `Excellent` ni `Surfable`. Verificar con `npm run test:e2e` en verde.

## 4. Medición reproducible

- [x] 4.1 Añadir el proyecto `measure` a `playwright.config.ts` (opcional, fuera de la ejecución por defecto, sin servidor local) y el script `test:measure` en `package.json`. Verificar que `npm test` no lo ejecuta y que `npm run test:measure -- --list` lo muestra.
- [x] 4.2 Crear `tests/measure/rating-stability.spec.ts` según D6: 5 regiones, horizonte completo, caché de Open-Meteo en `.cache/rating-trust/`, imprime saltos ≥3 entre horas visualmente idénticas, horas `Glass`/`Light` penalizadas e histograma por cuenca, y comprueba ≤0,1 % y 0 %. Verificar con `npm run test:measure` en verde y guardando la salida.

## 5. Documentación y cierre

- [x] 5.1 Actualizar `CLAUDE.md`: sección *Star Engine* (paso 4 de viento: sin rachas, calma de 10 km/h, 30/40 km/h; paso 3 de periodo continuo; el ratio 1,77 desaparece) y sección *Conditions* (etiqueta `Light`, ortografía, niveles Epic 6–10 / Fair 1–5). Verificar por lectura que no queda ninguna mención a 7,08, 19,28, 30,1 ni 1,77.
- [x] 5.2 Actualizar los comentarios de cabecera de `star-engine.ts` y `conditions.ts` que citan las constantes o el razonamiento antiguos (p. ej. "Magicseaweed's point that gusts matter more than the mean"). Verificar con `grep -n "gust" src/services/star-engine.ts` sin referencias a rachas en la nota.
- [x] 5.3 Ejecutar `npm test` (unit + e2e) completo en verde y `npm run lint` sin errores nuevos. *Resultado: 260 en verde; 5 fallos en `spot-catalog.spec.ts` ("Solo spots atestiguados") que leen solo datos del catálogo en curso del change `named-breaks-survive-curation` y no dependen de este change. Lint: 0 errores.*
- [x] 5.4 Añadir al `design.md` una nota con la salida real de `test:measure` tras implementar (saltos, horas Glass/Light penalizadas, distribución), para que la revalidación en una semana de temporal tenga línea base. Verificar que la nota está en el change.
