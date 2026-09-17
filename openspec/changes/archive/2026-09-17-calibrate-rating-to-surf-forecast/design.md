## Context

El cambio `rework-star-rating` estableció la estructura del motor (energía por componentes, periodo, dirección, viento, potencial) con constantes elegidas a mano. El orden de los días era bueno, pero la escala no se parecía a la de ningún servicio de referencia.

### Qué publican los servicios

Ninguno publica una fórmula. Solo principios:

- **surf-forecast** (FAQ): escala 0–10; sube con tamaño y periodo; el viento onshore resta en proporción a su velocidad; plano, onshore destructivo o viento muy fuerte en cualquier dirección dan 0; estrellas apagadas = swell sin viento. Energía: ~100 kJ apenas surfeable.
- **Surfline** (centro de soporte): 7 niveles; el modelo usa altura de surf en la orilla y viento; es machine learning entrenado con 35 años de observaciones propias; Good y Epic solo los asigna un forecaster; relativo al spot; sin marea.
- **Magicseaweed** (ayuda oficial archivada, hoy Surfline): 1–5; total = swell sin viento; el onshore apaga estrellas; sesgado al mar de fondo; la racha importa más que el viento medio.
- **Windguru** (ayuda oficial): sus estrellas son para windsurf y dependen del viento. No tiene rating de surf.

El modelo de Surfline no se puede reproducir ni en principio. Parecerse a un servicio exige calibrar contra sus resultados.

### Benchmark

Datos leídos de páginas públicas el 2026-09-17:
- **surf-forecast**: 206 franjas de 10 spots durante 7 días (Zarautz, Mundaka, Somo, Famara, Fistral, La Gravière, Supertubos, Barceloneta, Bells Beach, Uluwatu), con componentes de swell, energía, viento y estado del viento.
- **Surfline**: 350 ratings de modelo en 7 zonas (Cantábrico, Canarias, Cornualles, Landas, Peniche, Cádiz, Mediterráneo).

| Motor | Error medio vs surf-forecast | Exacto | ±1 | Orden vs Surfline |
|---|---|---|---|---|
| `rework-star-rating` | 2,77 | 8% | 15% | 0,69 |
| Calibrado, validado con spot fuera | 0,50 | 56% | 96% | 0,79 |

Sin entrenar contra Surfline su concordancia de orden también mejora, señal de que el ajuste generaliza.

Las dos escalas no son compatibles: lo que Surfline llama *Fair* (0,3–0,6 m sin viento) surf-forecast lo puntúa 0–2. Se elige surf-forecast: mismo formato de número y referencia más extendida en Europa.

## Goals / Non-Goals

**Goals**
- Error medio validado inferior a 1 estrella contra surf-forecast.
- Conservar la estructura y los principios publicados; cambiar solo los números.
- Poder recalibrar con más datos sin reescribir nada.

**Non-Goals**
- Reproducir las etiquetas de Surfline.
- Versionar el dataset completo de terceros: el repositorio guarda solo casos de referencia puntuales para los tests.

## Decisions

### D1 — Parámetros ajustados
Búsqueda aleatoria con refinamiento local minimizando el error absoluto medio de la nota redondeada; validación dejando fuera cada spot.

| Parámetro | Antes | Calibrado |
|---|---|---|
| Umbral de mar plano | 50 kJ | 51 kJ |
| Energía que da 10 | 5.000 kJ | 31.764 kJ |
| Curvatura (gamma) | 1 | 1,41 |
| Periodo < 6 / < 8 / < 10 s | ×0,5 / 0,7 / 0,85 | ×0,48 / 0,69 / 0,71 |
| Viento sin efecto por debajo de | 8 km/h | 7 km/h |
| Onshore que anula | 35 km/h | 19 km/h |
| Cruzado que anula | 90 km/h | 30 km/h |

El umbral de mar plano queda prácticamente igual que el elegido a partir del FAQ, lo que valida esa lectura. Gamma > 1 comprime el tramo bajo y medio: surf-forecast reserva las notas altas para mucha energía. El viento resulta bastante más severo de lo supuesto, sobre todo el cruzado.

Base con gamma: `base = 10 · r^γ` con `r = log(E/50)/log(Etop/50)` recortado a [0,1].

### D2 — Sin recorte por cierre de playa
surf-forecast no lo aplica: puntúa más los días grandes en playas de calidad. Mantenerlo desviaría la calibración. Se elimina; la puntuación es monótona en energía.

### D3 — Rachas normalizadas
Racha/medio medida en Open-Meteo en 7 puntos de costa durante 7 días (742 horas con viento ≥ 8 km/h): mediana 1,77, rango intercuartil 1,65–1,91.

`viento efectivo = max(medio, racha / 1,77)`

Con racheo típico es igual al medio y la calibración, hecha con viento medio, se conserva. Solo resta más cuando sopla más racheado de lo habitual. *Alternativa descartada:* usar la racha directamente, que habría penalizado de más todas las horas con las constantes calibradas.

### D4 — Niveles del mapa
Pobre 0 · aceptable 1–4 · excelente 5+. surf-forecast marca una estrella como "good surf" en su propia interfaz, y en el benchmark ningún spot normal pasó de 4; las notas de 5 a 9 aparecieron solo en el mejor spot del mundo de cada franja.

## Risks / Trade-offs

- **Una semana de datos.** El máximo observado en spots normales fue 4; el tramo 5–10 está extrapolado. Comportamiento comprobado como monótono y razonable (4 m a 18 s ≈ 8). Mitigación: `scripts/calibrate-rating.mjs` permite repetir el ajuste con un temporal de invierno.
- **Estado del viento aproximado.** surf-forecast etiqueta el viento (off, cross-off, cross, cross-on, on, glassy); se tradujo a ángulos 0/45/90/135/180.
- **Datos de terceros.** Recogidos a mano para una calibración puntual. No se automatiza su extracción recurrente, que chocaría con los términos de esos servicios.
