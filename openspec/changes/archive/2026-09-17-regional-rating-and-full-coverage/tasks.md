## 1. Puntuación regional

- [x] 1.1 `src/services/basins.ts` con clasificación por coordenadas
- [x] 1.2 Parámetros por cuenca en `star-engine.ts`
- [x] 1.3 La ruta de forecast pasa la cuenca

## 2. Puntuación por lotes

- [x] 2.1 `getMarineForecastBatch` en `marine-api.ts`: día UTC completo, hasta 50 coordenadas, unión por timestamp
- [x] 2.2 `/api/forecast/batch` por región y lote
- [x] 2.3 Mapa: pedir lotes visibles, dibujar solo spots puntuados, sin tope por vista

## 3. Interfaz

- [x] 3.1 Leyenda como primera sección del panel de información, fuera de la cabecera

## 4. Catálogo

- [x] 4.1 Descarga verificada contra recuento, reintento si falta
- [x] 4.2 Derivar Francia y Reino Unido
- [x] 4.3 Filtro de spots sin datos de oleaje (script offline parcial por límite horario: 4.000+ revisados, 0 descartados; el mapa oculta en vivo los spots sin datos)
- [x] 4.4 Tests de catálogo con cuatro países y condados ingleses

## 5. Verificación

- [x] 5.1 Tests unitarios de cuenca y anclajes mediterráneos
- [x] 5.2 E2E de lotes, leyenda y spots ocultos
- [x] 5.3 Suite, lint, build y despliegue
