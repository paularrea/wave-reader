# PRD: Un rating en el que se puede confiar

*21-09-2026 · Entrada para `/opsx:new`. Proceso previo: brainstorm → medición sobre la propia app → benchmark de competidores → simulación de alternativas → decisión.*

## 1. Problema

**Cuando** un surfista compara dos horas o dos spots cuyo pronóstico en pantalla es el mismo, la nota difiere entre 3 y 6 estrellas. **La causa**: el motor puntúa con un viento efectivo inflado por las rachas, que la UI no muestra, y lo pasa por un umbral duro (7,08 km/h) y una pendiente onshore muy empinada (anula el surf a 19 km/h). **El efecto**: el número parece arbitrario y el surfista vuelve a surf-forecast para decidir. Le pasa también al propio PM.

**Evidencia** (334 spots de 5 regiones, 168 h, motor real, pronóstico de Open-Meteo del 21-09-2026):

| Métrica | Hoy |
|---|---|
| Pares de horas consecutivas visualmente idénticas* con salto ≥3 estrellas | **1,60 %** (Atlántico) |
| Días-spot atlánticos con al menos uno de esos saltos | **15,7 %** |
| Causa de los saltos ≥3 | viento **95 %** (umbral 47 %, pendiente 48 %) · periodo 5 % |
| Horas con badge "Glass" (<5 km/h) penalizadas por viento | **29–34 %** |

\* Misma altura en pantalla ±0,1 m, mismo periodo redondeado y viento ±3 km/h.

**Causas raíz, según el archivo de la calibración anterior:**
- El ratio racha/medio de 1,77 se midió solo con viento ≥8 km/h. Con viento flojo la racha relativa se dispara y el viento efectivo se infla.
- Las constantes de viento se ajustaron sobre datos de surf-forecast con resolución de 5 km/h, 3 franjas al día y notas de 0 a 4. Después se aplicaron sobre una escala estirada a 0–10, así que el mismo multiplicador produce saltos absolutos 2,5 veces mayores.

**Benchmark:**
- Wavey publica su fórmula y trata el viento por debajo de 10 km/h como ideal sea cual sea la dirección; el onshore hasta 15 km/h le parece "tolerable".
- Todos los competidores ganan estabilidad con escalas gruesas.
- Ninguno explica por hora el porqué de la nota.

## 2. Objetivos

1. **Estabilidad.** Saltos ≥3 entre horas visualmente idénticas: de 1,60 % a **≤0,1 %**. Simulado con la opción elegida: 0,01 %.
2. **Coherencia.** **0 %** de horas en las que la etiqueta de viento diga "Glass" y la nota pierda puntos por viento.
3. **Viento flojo = casi glass.** Con viento medio ≤10 km/h, en cualquier dirección, `stars == swellStars`.
4. **Un solo lenguaje.** La etiqueta de viento, el veredicto y la nota nunca se contradicen: con etiqueta `Glass` o `Light` el viento nunca resta; y el mismo nivel tiene el mismo nombre en toda la UI.
5. **Seguridad del rating.** Se mantienen todos los guardarraíles de la spec `surf-rating`: onshore de 25 km/h deja la nota en menos de la mitad, temporal = 0, mar plano = 0, chop mediterráneo = 0.

## 3. Lo que queda fuera

| Fuera de alcance | Por qué |
|---|---|
| Suavizado temporal (mediana móvil) | Descartado con datos: deja los saltos en 1,36 %. Son cambios de régimen, no picos de una hora |
| Nota solo con swell, sin viento | Rompe la regla "temporal = 0" y va contra todos los competidores |
| Mover las anclas de energía o los umbrales de tier (`EPIC_THRESHOLD = 6`) | Decisión tomada: la subida de la escala es la corrección, no un efecto secundario (ver §7) |
| Rango de confianza con varios modelos | Buena idea (Wavey), pero es otra apuesta y otro change |
| Feedback de usuarios / aprendizaje | No hay usuarios |
| Desglose o línea de pérdida por viento en la UI | Decisión del PM (Etapa 6): el veredicto y la etiqueta coherentes bastan; más números no dan más confianza |
| Recalibrar el Mediterráneo | Esa semana estuvo plano (todo 0) y no hay evidencia. El cambio de viento le afecta porque la lógica de viento es compartida (ver riesgos) |

## 4. Historias de usuario

- **Como surfista que compara horas del día**, quiero que dos horas con el mismo mar y el mismo viento tengan la misma nota, para elegir cuándo ir fiándome del número.
- **Como surfista que ve "Glass" en la tarjeta de viento**, quiero que la nota no pierda puntos por viento, para no recibir dos mensajes contradictorios.
- **Como surfista que ve una nota más baja de lo que esperaba por el tamaño**, quiero que el veredicto y la etiqueta de viento nombren el viento que la baja, para entenderlo sin leer números.
- **Como surfista en un día de onshore real**, quiero que la nota siga bajando claramente, para no conducir hasta un mar roto.
- **Como PM**, quiero volver a ejecutar la medición de estabilidad cuando quiera, para comprobar los objetivos ahora y en una semana de mar mala.

## 5. Requisitos

### P0: sin esto no se lanza

**R1 · Se puntúa con el viento que se enseña.** El factor de viento usa el viento medio (`wind_speed_10m`). Las rachas dejan de entrar en la nota.
- [ ] Dado el mismo viento medio, cambiar solo la racha no cambia `stars`.
- [ ] La etiqueta de viento y el factor de viento leen el mismo valor.

**R2 · Viento flojo sin penalización y rampa continua.** Por debajo de 10 km/h el viento no resta en ninguna dirección. Por encima, la penalización crece de forma continua desde 0, sin escalón.
- [ ] Onshore puro a 2, 5 y 10 km/h sobre un mar de 7 → 7.
- [ ] En cualquier dirección, el factor de viento cambia como mucho 0,1 entre *v* y *v*+1 km/h.

**R3 · Pendiente onshore más suave.** Sobre el exceso por encima de la calma, el onshore puro anula el surf a 30 km/h y el cruzado a 40 km/h. Se mantiene la regla de viento fuerte (a partir de 45 km/h en cualquier dirección, 0 a los 75).
- [ ] Mar de 7, onshore puro: 15 km/h → 5 · 20 → 4 · 25 → 2 · 30 → 0 (±1).
- [ ] Offshore de 15 km/h → nota igual a la potencial.
- [ ] Más de 75 km/h en cualquier dirección → 0.

**R4 · Periodo continuo.** El factor de periodo pasa a ser una curva monótona sin escalones. Vale 1,0 desde el periodo de las anclas (10 s en el Atlántico, 6 s en el Mediterráneo), para que las anclas sigan puntuando lo que dicen. En el Atlántico pasa por (5 s, 0,48), (7 s, 0,69), (9 s, 0,71) y (10 s, 1,0). *Corregido al redactar las specs: la curva inicial llegaba a 1,0 en 11 s y dejaba 1,4 m @ 10 s en 6 en vez de 7.*
- [ ] 2,2 m @ 9,9 s y 2,2 m @ 10,1 s difieren como mucho 1 estrella.
- [ ] Se mantiene: 3 m @ 6 s puntúa menos que 1,5 m @ 12 s.
- [ ] Se mantiene: en el Mediterráneo, 1,0 m @ 4 s con calma → 0.

**R5 · Un solo lenguaje para el viento y la calidad.** La UI no muestra desglose ni línea de pérdida por viento (decisión del PM, Etapa 6); la explicación la dan el veredicto y la etiqueta de viento, que deben coincidir con el motor.
- Etiqueta de viento: `Glass` por debajo de 5 km/h, **`Light`** de 5 a 10 km/h (nueva, verde), y `Offshore` / `Cross-shore` / `Onshore` a partir de 10 km/h.
- Veredicto: "light" significa menos de 10 km/h, el mismo umbral que el motor.
- Se retira la línea "Swell alone X/10 · wind costs Y" del detalle. `swellStars` se sigue calculando porque lo usa el mapa.
- Ortografía única: **onshore / offshore / cross-shore** (hoy la etiqueta dice `On-shore` / `Off-shore`).
- Un nombre por nivel: el recuadro de la nota y el veredicto usan **Epic / Fair / Poor**; `Flat` y `Blown out` se mantienen como tipos concretos de Poor (hoy el veredicto dice Excellent / Surfable).
- [ ] 0 % de horas con etiqueta `Glass` o `Light` y pérdida por viento.
- [ ] Siempre que el viento resta, el veredicto nombra su dirección relativa y su fuerza.
- [ ] Ninguna cadena visible usa `On-shore`, `Off-shore`, `Excellent` ni `Surfable`.
- [ ] Viento desconocido → sin etiqueta y sin frase de viento en el veredicto (como hoy).

**R6 · Documentación en el mismo change.** Se actualizan el texto del `DataInfoPanel`, la sección *Star Engine* de `CLAUDE.md` y la spec `surf-rating`. En la spec cambia el requisito de rachas y el del periodo corto. Es regla del repo: si cambia el rating, cambia el panel.

**R7 · Medición reproducible.** Se versiona un script que calcula las métricas de §1 sobre N regiones y el horizonte completo. También se añaden tests unitarios de continuidad (R2, R4) y de los guardarraíles (R3). Los scripts de esta investigación están en `openspec/proposals/rating-trust-evidence/`.
- [ ] Ejecutado sobre el mismo conjunto de 5 regiones: saltos ≥3 ≤0,1 %, horas Glass penalizadas = 0 %.

### P1: justo después

- **Racha como dato informativo** en la tarjeta de viento: se ve, pero no puntúa.

### P2: diseñar sin cerrarse a ello

- Rango de confianza con varios modelos (Open-Meteo sirve varios).
- Volver a meter las rachas con un ratio que dependa de la velocidad, si aparece evidencia de que importan con viento moderado.
- Recalibrar el viento del Mediterráneo con una semana de mar.

## 6. Métricas de éxito

| Tipo | Métrica | Hoy | Objetivo | Cómo y cuándo |
|---|---|---|---|---|
| Adelantada | Saltos ≥3, pares visualmente idénticos | 1,60 % | ≤0,1 % | script R7, al cerrar el change |
| Adelantada | Horas Glass penalizadas | 29–34 % | 0 % | script R7, al cerrar el change |
| Adelantada | Horas con etiqueta `Glass`/`Light` y pérdida por viento | 29–34 % (Glass) | 0 % | script R7 + test unitario |
| Revalidación | Las mismas métricas **en una semana de mar y viento malos** | — | saltos ≤0,1 % y distribución documentada | script R7, primera semana de temporal |
| Retrasada | Confianza del PM: días en los que abre surf-forecast para contrastar | "siempre" | ≤1 de cada 5 sesiones durante 2 semanas | diario propio (no hay analítica) |

## 7. Decisión de escala (aceptada)

Arreglar el viento sube la nota media del Atlántico de **2,2 a 3,9**. Las horas ≥5 pasan del 16 % al 42 % y los marcadores *epic* (≥6), del 10 % al 29 % (cifras con la curva de periodo corregida). **Se acepta como corrección:** las anclas (1,0 m @ 10 s limpio = 5) son las del producto, y las constantes de viento heredadas las estaban hundiendo. El umbral de epic sigue en 6 porque está definido por el mar (1,2 m @ 10 s limpio), no por la distribución. Se documenta en el `design.md` con la simulación y se revalida en una semana mala.

## 8. Riesgos

- **Una sola semana de datos, y con mucho viento flojo.** Mitigación: la revalidación de §6.
- **Mediterráneo sin evidencia.** El viento es compartido entre cuencas y el cambio le afecta. Mitigación: revisarlo explícitamente en la revalidación.
- **Más amarillo en el mapa.** Puede leerse como "todo es bueno". Mitigación: veredicto y etiqueta coherentes (R5) y la revalidación.

## 9. Preguntas abiertas

Ninguna bloqueante. Resueltas en la Etapa 6: sin línea de explicación, etiqueta `Light` de 5 a 10 km/h, vocabulario unificado. Queda para diseño, sin bloquear: si la racha se muestra como dato informativo en la tarjeta de viento (P1).

## 10. Plan

- **Antes de nada:** cerrar o aparcar el change abierto `2026-09-20-named-breaks-survive-curation`.
- **Etapa 6 (hecha):** copy y vocabulario de R5.
- **Etapas 7–12:** `/opsx:explore` → `/opsx:new` → `/opsx:continue` (proposal, design, delta de `surf-rating`, tasks) → `/opsx:apply` → `/opsx:verify` → `/opsx:archive`. Un solo change: motor y coherencia del lenguaje salen juntos (decisión del PM). La etiqueta cambia la spec `condition-rating`, además de `surf-rating`.
