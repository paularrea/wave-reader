## 1. Escala de surfeabilidad
- [x] 1.1 Sustituir `energyScore` por interpolación entre anclas por cuenca
- [x] 1.2 Endurecer el factor de periodo del Mediterráneo por debajo de 5 s
- [x] 1.3 Tests unitarios de las anclas y de los casos reportados
- [x] 1.4 Actualizar `DataInfoPanel` y `CLAUDE.md` con la nueva escala

## 2. Catálogo curado
- [x] 2.1 Lista curada de breaks conocidos por región
- [x] 2.2 `scripts/curate-spots.mjs`: exclusión por nombre, exposición, dedup
- [x] 2.3 Regenerar catálogo y revisar el informe de descartes
- [x] 2.4 Test de integridad del catálogo curado

## 3. Un fichero por país
- [x] 3.1 Emitir `spots/<iso2>.json`, `spots/<iso2>.index.json`, `regions.json`
- [x] 3.2 Rutas de API leyendo el país en servidor
- [x] 3.3 Cliente cargando el índice del país en foco bajo demanda

## 4. Selector de país
- [x] 4.1 Desplegable buscable de país en `RegionPicker`
- [x] 4.2 E2E del selector con país y región

## 5. Verificación
- [x] 5.1 `npm test` en verde
- [x] 5.2 Desplegar a producción y `npm run test:prod`
