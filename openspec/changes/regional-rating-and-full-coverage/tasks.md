## 1. Puntuación regional

- [ ] 1.1 `src/services/basins.ts` con clasificación por coordenadas
- [ ] 1.2 Parámetros por cuenca en `star-engine.ts`
- [ ] 1.3 La ruta de forecast pasa la cuenca

## 2. Puntuación por lotes

- [ ] 2.1 `getRatingsBatch` en `marine-api.ts`: una hora, hasta 50 coordenadas
- [ ] 2.2 `/api/forecast/batch` por región y lote
- [ ] 2.3 Mapa: pedir lotes visibles, dibujar solo spots puntuados, sin tope por vista

## 3. Interfaz

- [ ] 3.1 Leyenda como primera sección del panel de información, fuera de la cabecera

## 4. Catálogo

- [ ] 4.1 Descarga verificada contra recuento, reintento si falta
- [ ] 4.2 Derivar Francia y Reino Unido
- [ ] 4.3 Filtro de spots sin datos de oleaje
- [ ] 4.4 Tests de catálogo con cuatro países y condados ingleses

## 5. Verificación

- [ ] 5.1 Tests unitarios de cuenca y anclajes mediterráneos
- [ ] 5.2 E2E de lotes, leyenda y spots ocultos
- [ ] 5.3 Suite, lint, build y despliegue
