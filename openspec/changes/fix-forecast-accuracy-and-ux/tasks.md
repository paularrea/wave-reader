## 1. Catálogo de spots

- [x] 1.1 Crear `scripts/build-spot-catalog.mjs`: resuelve cada nombre contra Nominatim (1 req/s, User-Agent identificable), valida tipo costero, valida elevación en `(0, 100)` vía API de elevación de Open-Meteo, y escribe `src/data/spots.json` con bloque `provenance` por spot
- [x] 1.2 Ejecutar el script sobre la lista semilla actual y revisar el diff: registrar cuántos spots se conservan y cuántos se descartan con su motivo
- [x] 1.3 Añadir `tests/spot-catalog.spec.ts`: sin coordenadas duplicadas, ≥4 decimales, todos con `provenance`
- [ ] 1.4 Verificar contra los specs: `spot-catalog` — los 4 requisitos y sus 7 escenarios

## 2. Datos marinos

- [x] 2.1 Reescribir `src/services/marine-api.ts`: dos peticiones en paralelo (marine + forecast) con `timezone=auto`, fusión por marca de tiempo, no por índice de array
- [x] 2.2 Eliminar la multiplicación `* 1.852` sobre la velocidad de viento
- [x] 2.3 Tipar todas las magnitudes opcionales como `number | null` y eliminar todo `?? 0` de la capa de servicio
- [x] 2.4 Exponer dirección de swell primario, swell secundario y olas de viento en la respuesta
- [x] 2.5 Corregir la clave de caché de `src/app/api/forecast/route.ts` para incluir el nivel del surfista
- [ ] 2.6 Verificar contra los specs: `marine-data` — los 4 requisitos y sus 6 escenarios

## 3. Mareas

- [x] 3.1 Crear `src/services/tides.ts`: detección de extremos locales sobre la serie de nivel del mar, con filtro de prominencia mínima de 10 cm
- [x] 3.2 Exponer los extremos del día seleccionado en la respuesta de `/api/forecast`
- [x] 3.3 Añadir la sección de pleamar/bajamar al drawer, con estado explícito de "sin datos"
- [x] 3.4 Hacer que las mareas sigan al día seleccionado en la línea temporal, no al día actual
- [ ] 3.5 Verificar contra los specs: `tide-extremes` — los 3 requisitos y sus 6 escenarios

## 4. Línea temporal

- [x] 4.1 Crear `src/services/timeline.ts`: ancla en la hora en punto siguiente, pasos de 1 h, formateo en la zona horaria del spot a partir de `utc_offset_seconds`
- [x] 4.2 Convertir el slider de `src/app/page.tsx` en controlado (`value` ligado al store) y alinear `step` a 1 hora
- [x] 4.3 Añadir etiquetado de día (hoy / mañana / día con fecha) y marca visual de la frontera entre días
- [ ] 4.4 Verificar contra los specs: `forecast-timeline` — los 4 requisitos y sus 7 escenarios

## 5. Escala de condiciones y seguridad

- [x] 5.1 Sustituir la escala de color de los marcadores en `src/components/shared/MarineMap.tsx`: fuera `#6EE7B7`, amarillo único con opacidad creciente
- [x] 5.2 Unificar la escala del drawer con la del mapa en un único módulo compartido
- [x] 5.3 Ampliar el motivo de la alerta en `src/services/star-engine.ts` para citar magnitud, límite y spot
- [x] 5.4 Marcar en rojo el marcador de los spots peligrosos para el nivel declarado
- [x] 5.5 Mostrar fuerza y dirección de viento junto al badge, y ocultar el badge cuando no hay dato
- [ ] 5.6 Verificar contra los specs: `condition-rating` — los 4 requisitos y sus 9 escenarios

## 6. Suite E2E y despliegue

- [x] 6.1 Crear `playwright.config.ts` con `webServer` que levante la app y `baseURL`
- [x] 6.2 Añadir el script `test:e2e` a `package.json` (hoy `CLAUDE.md` documenta un comando inexistente)
- [x] 6.3 Reescribir `tests/mvp.spec.ts`: elimina los asserts obsoletos de formato `+24h` / `+0h`
- [x] 6.4 Escribir un test E2E por escenario de spec, con fixtures deterministas para el forecast
- [ ] 6.5 Ejecutar la suite completa en verde
- [x] 6.6 `npm run build` en verde con Node ≥ 20.9
- [x] 6.7 Actualizar `CLAUDE.md`: endpoints correctos, unidades, comando de test real
