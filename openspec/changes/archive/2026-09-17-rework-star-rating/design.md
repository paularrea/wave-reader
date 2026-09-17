## Context

El motor actual puntúa la coincidencia entre la altura del oleaje y el rango de comodidad del nivel elegido. Eso produce 8/10 para 0,3 m a 3 s. Antes de rediseñarlo se estudió cómo puntúan los servicios de referencia.

### Estudio de mercado

**Surf-forecast.com** (escala 0-10). Según su FAQ, a mayor swell y mayor periodo, mayor puntuación; con viento onshore la puntuación cae en proporción a su fuerza; el mar plano, el viento onshore que destroza el mar o el viento muy fuerte en cualquier dirección dan 0. Las estrellas apagadas indican hasta dónde habría llegado el swell si el viento acompañara. Publica la energía del oleaje en kJ: ~100 kJ apenas surfeable, 200–1.000 kJ cada vez con más fuerza, 1.000–5.000+ pesado y peligroso en algunos spots.

**Magicseaweed** (0-5, hoy integrado en Surfline). Estrellas sólidas = potencia y tamaño del swell; estrellas apagadas = lo que resta el viento. Separa explícitamente calidad del swell y efecto del viento.

**Surfline** (Very Poor → Epic). Escala por porcentaje de olas surfeables y buenas. Tamaño, frecuencia, viento y marea. Es relativa al spot: un "Fair" en Pipeline no es un "Fair" en una playa normal.

Ninguno de los tres ajusta la puntuación al nivel del surfista. Todos separan calidad del mar y efecto del viento.

### Calibración contra datos reales

Se extrajeron 26 franjas horarias de surf-forecast (Zarautz y Barceloneta). La energía publicada ajusta a **E ≈ 1,9 · H² · T² kJ** con error por debajo del redondeo de altura y periodo:

| Mar | Publicado | 1,9·H²·T² | Estrellas publicadas |
|---|---|---|---|
| 2,5 m @ 14 s | 2.323 | 2.328 | 4 |
| 2,1 m @ 13 s | 1.498 | 1.416 | 4 |
| 1,4 m @ 11 s | 457 | 450 | 3 |
| 1,3 m @ 10 s | 320 | 321 | 1 |
| 0,7 m @ 8 s | 56 | 60 | 0 |
| 0,4 m @ 3 s | 2 | 3 | 0 |

Todas las franjas por debajo de ~60 kJ tienen 0 estrellas.

## Goals / Non-Goals

**Goals**
- Que el mar plano o de viento diminuto nunca puntúe.
- Que el periodo pese tanto como la altura, como en la física del oleaje.
- Que la puntuación se pueda explicar al usuario: energía, potencial y lo que resta el viento.

**Non-Goals**
- Reproducir la escala absoluta de surf-forecast, que es muy conservadora (2.323 kJ en plancha = 4/10). La semántica objetivo es la de Surfline: 5 aceptable, 7 bueno, 10 épico.
- Modelar marea, fondo o tipo de rompiente por spot. El catálogo no tiene esos datos y inventarlos sería fabricar precisión.

## Decisions

### D1 — La puntuación no depende del nivel
Es el estándar de los tres servicios estudiados y elimina la causa raíz: el rango de comodidad de un principiante (0,4–1,2 m) incluye mar de viento que nadie surfea. El nivel solo gobierna el aviso de seguridad.

*Consecuencia aceptada:* cambiar de nivel ya no recolorea los marcadores excepto para marcar peligro.

### D2 — Energía como base, en escala logarítmica
`E = Σ 1,9 · Hᵢ² · Tᵢ²` sobre swell primario, secundario y olas de viento (la energía es aditiva entre componentes). Puntuación base:

`base = 10 · log10(E / 50) / 2`, recortada a [0, 10]

| Energía | Base | Referencia |
|---|---|---|
| < 50 kJ | 0 | plano |
| 100 kJ | 1,5 | apenas surfeable |
| 300 kJ | 3,9 | longboard |
| 1.000 kJ | 6,5 | bueno |
| 2.300 kJ | 8,3 | épico en playa |
| 5.000 kJ | 10 | tope |

Logarítmica porque la percepción del tamaño lo es: pasar de 100 a 200 kJ se nota mucho más que de 3.000 a 3.100.

### D3 — Cierre en playas por encima de 5.000 kJ
Todo el catálogo son playas (OSM `natural=beach`). Con energía muy alta una playa cierra en lugar de abrirse. Por encima de 5.000 kJ se restan 2 puntos por cada duplicación. El umbral coincide con el techo de D2 a propósito: la primera versión lo puso en 4.000 kJ y con eso ninguna playa podía llegar a 10. *Alternativa descartada:* sin límite, 4 m a 18 s puntuaría 10 en cualquier arenal.

### D4 — Factor de periodo sobre el periodo ponderado por energía
`T < 6 s → ×0,5` · `6–8 s → ×0,7` · `8–10 s → ×0,85` · `≥ 10 s → ×1`. La energía ya castiga el periodo corto, pero no captura el desorden: 3 m a 6 s y 1,5 m a 12 s suman la misma energía y no son el mismo baño. Los cortes siguen la frontera mar de viento / mar de fondo (~10–11 s) citada en las guías de lectura de previsiones.

### D5 — Dirección por componente
Cada componente se pondera según su dirección respecto a la ventana de swell del spot: dentro, ×1; fuera, decae linealmente hasta ×0,1 a 45° del borde, y ×0,1 a partir de ahí. No llega a 0 porque el oleaje refracta. Por componente, porque las olas de viento pueden entrar desde otra dirección que el swell.

### D6 — Viento por componentes onshore y cruzada
Con la orientación del spot `F` (recíproco del ángulo offshore) y la dirección de procedencia del viento `W`:
- menos de 8 km/h → sin efecto;
- `onshore = v · max(0, cos(W − F))`, `cruzado = v · |sin(W − F)|`;
- `factor = clamp(1 − onshore/35 − cruzado/90, 0, 1)`;
- por encima de 45 km/h, además `× max(0, 1 − (v − 45)/30)`: a 75 km/h, 0 en cualquier dirección.

Onshore de 15 km/h → ×0,57; de 25 → ×0,29; de 35 → 0. Cruzado de 20 → ×0,78. Offshore moderado → ×1. Sin bonus por offshore: 10 ya es el máximo, y multiplicar una nota saturada fue parte del fallo original.

### D7 — Seguridad sobre altura de rompiente (Komar–Gaughan)
`Hb = 0,39 · g^0,2 · (T · H²)^0,4`, con `H = √Σ Hᵢ²` y el periodo ponderado por energía. El aviso de principiante salta si `Hb` supera el mayor entre el máximo del spot para principiantes y 1,5 m. 1 m a 8 s rompe a ~1,4 m (sin aviso); 1,2 m a 14 s rompe a ~2 m (aviso), aunque 1,2 m en aguas profundas no superase el límite anterior.

## Risks / Trade-offs

- **Nuestras notas serán más altas que las de surf-forecast** para el mismo mar (2.300 kJ en plancha: 8 frente a 4). Decisión consciente por semántica (D2). Mitigación: la energía en kJ se muestra junto a la nota para que el usuario pueda compararla directamente.
- **Coeficientes calibrados, no aprendidos.** No hay dataset de valoraciones propias. Mitigación: los tests anclan casos reales de surf-forecast y las relaciones de orden que deben mantenerse.
- **Suma de componentes con fallback.** Si el proveedor no da `swell_wave_height` y el servicio cae a `wave_height` (mar combinado), sumar olas de viento duplica parte de la energía. Es raro y sobreestima levemente; se documenta.
