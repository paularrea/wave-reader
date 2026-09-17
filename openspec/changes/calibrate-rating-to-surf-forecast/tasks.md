## 1. Motor

- [x] 1.1 Aplicar los parámetros calibrados en `src/services/star-engine.ts`, con curvatura gamma
- [x] 1.2 Eliminar el recorte por cierre de playa
- [x] 1.3 Viento efectivo con racha normalizada por 1,77

## 2. Datos

- [x] 2.1 Pedir `wind_gusts_10m` en `src/services/marine-api.ts` y exponer `windGust`

## 3. Niveles

- [x] 3.1 Umbrales en `src/services/conditions.ts`: excelente ≥ 5, aceptable ≥ 1

## 4. Calibración reproducible

- [x] 4.1 `scripts/calibrate-rating.mjs` leyendo el dataset local de `.cache/benchmark/`
- [x] 4.2 Casos de referencia de surf-forecast como fixture de tests

## 5. Verificación

- [x] 5.1 Tests unitarios: escenarios del spec, casos de referencia ≥ 85% a ±1
- [x] 5.2 Tests E2E de niveles con los nuevos umbrales
- [x] 5.3 Suite, lint y build en verde
- [x] 5.4 Actualizar `CLAUDE.md`
