## Decisions

1. **Lote con horizonte completo**: `/api/forecast/batch?region&chunk&level` pide a Open-Meteo `start_hour`=hora UTC de anclaje y `end_hour`=+168 h para los 50 puntos (2 llamadas, caché 1 h). Respuesta compacta por spot: `stars[]` (−1 sin dato), `swellStars[]`, `height[]` (dm), `period[]` (s), `danger[]` (índices). ~20–40 KB por lote. Coste en cuota igual que un lote de un día, pero se elimina una llamada por cada día visitado con el slider, y habilita "Best in view" y la mejor nota por día sin más peticiones.
2. **Índice por tiempo absoluto**: el cliente calcula el índice como (hora objetivo UTC − `start`)/1 h, así un lote pedido en la hora anterior sigue siendo válido; un lote de hace más de 60 min se vuelve a pedir.
3. **Resumen del mapa** en el store (`mapSummary`): mejores 3 visibles a la hora actual y mejor nota por día local, calculados en `services/map-summary.ts` (puro y testeado).
4. **Best in view abre a la hora mostrada**: el ranking se calculó para esa hora; resetear a hoy contradiría lo que el usuario acaba de pulsar. Los marcadores siguen reseteando a hoy.
5. **Selector de región y nivel** como hojas Vaul con botones reales, sustituyen a los `<select>` nativos; el nivel explica que solo afecta a las alertas.
6. **Tokens** en `globals.css` (`@theme`): ground `#0A0B0D`, sheet `#121417`, card `#1A1D21`, línea `rgba(255,255,255,.07)`, texto `#F4F4F5`/`#A1A1AA`, fair `#B45309`, epic `#FBBF24`, alerta `#EF4444`. Viento con badges tintados.
7. **Veredicto** (`services/verdict.ts`): calidad (Excellent/Surfable/Blown out/Poor/Flat) + altura + tipo por periodo (groundswell ≥10 s, swell ≥7 s, wind swell) + viento (glassy / light, moderate, strong + offshore, cross-shore, onshore).
