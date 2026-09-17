## 1. Motor de puntuación

- [x] 1.1 Reescribir `src/services/star-engine.ts`: energía por componentes, base logarítmica, cierre por encima de 5.000 kJ, factor de periodo, dirección por componente y factor de viento
- [x] 1.2 Eliminar la dependencia del nivel en la puntuación
- [x] 1.3 Exponer `swellStars` (potencial sin viento) y `energyKj`
- [x] 1.4 Aviso de principiante sobre altura de rompiente (Komar–Gaughan)

## 2. API y UI

- [x] 2.1 Añadir `swellStars` y `energyKj` a la respuesta de `/api/forecast`
- [x] 2.2 Mostrar energía y estrellas potenciales en el detalle del spot

## 3. Verificación

- [x] 3.1 Tests unitarios calibrados con los datos reales de surf-forecast y el caso 0,3 m @ 3 s
- [x] 3.2 Tests de las relaciones de orden: periodo, dirección, viento, independencia del nivel
- [x] 3.3 Test E2E de energía y potencial en el detalle
- [x] 3.4 Suite completa, build y lint en verde
- [x] 3.5 Actualizar la sección Star Engine de `CLAUDE.md`
