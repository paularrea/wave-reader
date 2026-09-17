## Why

La puntuación de estrellas no mide si hay surf. Mide si la altura cae dentro del rango de comodidad del nivel elegido: con nivel intermedio, 0,3 m a 3 s con viento offshore puntúa 8/10, y para un principiante 10/10 — lo mismo que 1,5 m a 12 s. Surf-forecast da 0 estrellas a ese mar (≈2 kJ de energía; sitúa el umbral de "apenas surfeable" en ~100 kJ). El periodo apenas influye (+1 sobre una base de 10) y el viento multiplica una nota ya saturada que luego se recorta. Ningún spec define cómo se calcula la puntuación, así que ningún test podía detectar el fallo.

## What Changes

- **BREAKING**: la puntuación deja de depender del nivel del surfista. Mide la calidad del surf, como hacen surf-forecast, Magicseaweed y Surfline. El nivel pasa a gobernar solo el aviso de seguridad. Cambiar de nivel ya no recolorea los marcadores salvo para marcar peligro.
- La puntuación parte de la energía del oleaje (altura² × periodo², la misma magnitud que surf-forecast muestra en kJ), sumada sobre swell primario, secundario y olas de viento.
- Por debajo de un umbral de energía el mar se considera plano y puntúa 0, sea cual sea el viento.
- El periodo corto penaliza por sí mismo (mar de viento desordenado), además de restar energía.
- La energía que llega desde fuera de la ventana de swell del spot se atenúa.
- El viento resta en proporción a su componente onshore y a su fuerza; el viento muy fuerte anula la puntuación en cualquier dirección.
- La respuesta expone también la puntuación potencial sin viento (las "estrellas apagadas" de Magicseaweed y surf-forecast) y la energía en kJ.
- El aviso de peligro para principiantes se basa en la altura de rompiente estimada, no en la altura en aguas profundas.

## Capabilities

### New Capabilities
- `surf-rating`: Cálculo de la puntuación de calidad del surf a partir de energía, periodo, dirección del swell y viento, y de la puntuación potencial sin viento.

### Modified Capabilities
- `condition-rating`: el aviso de seguridad pasa a evaluarse sobre la altura de rompiente estimada.

## Impact

- `src/services/star-engine.ts`: reescritura del cálculo.
- `src/app/api/forecast/route.ts`: la respuesta añade energía y puntuación potencial.
- `src/components/shared/SpotDetailDrawer.tsx`: muestra energía y estrellas apagadas.
- `tests/unit/`: casos calibrados contra datos reales de surf-forecast.
- Sin cambios en dependencias, catálogo ni API externa.
