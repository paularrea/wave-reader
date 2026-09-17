## 1. Datos

- [ ] 1.1 `getMarineSeries` en `marine-api.ts`: todas las horas del horizonte, unidas por timestamp, con mareas por día
- [ ] 1.2 `/api/forecast/series` con rating y seguridad por hora
- [ ] 1.3 `src/services/forecast-series.ts`: franjas de 3 h, altura y color de pill

## 2. Detalle

- [ ] 2.1 Carga única por spot y nivel con caché de sesión, reintentos y estado de error
- [ ] 2.2 `ForecastTimeline` con pills y etiquetas de día, sustituye las pestañas
- [ ] 2.3 Abrir un spot resetea la hora a hoy

## 3. Panel de información

- [ ] 3.1 Tarjetas, leyenda destacada y accesos rápidos

## 4. Verificación

- [ ] 4.1 Unit: franjas, alturas, colores, serie
- [ ] 4.2 E2E: pills, 3 días en móvil, reset al abrir, reintento y error, cambio de hora sin peticiones, accesos rápidos
- [ ] 4.3 Suite, lint, build, despliegue y smoke de producción
