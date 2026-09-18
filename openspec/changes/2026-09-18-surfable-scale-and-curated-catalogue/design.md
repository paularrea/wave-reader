# Diseño

## 1. Por qué la nota deja de perseguir a surf-forecast

surf-forecast es, en la experiencia del usuario, la previsión más fiable. Pero
"fiable" ahí se refiere a **los datos** —altura, periodo, dirección, viento—, no
a su escala de estrellas, que es otra decisión de producto.

Sus propias cifras lo demuestran. De la captura aportada, mismo spot, mismo día:

| Energía | Viento | Estrellas surf-forecast |
|---|---|---|
| 376 kJ (1,4 m · 10 s) | cross 15 km/h | 0 |
| 1.777 kJ (2,3 m · 13 s) | cross-off 5 | 4 |
| 666 kJ (1,6 m · 12 s) | off 5 | 3 |
| 237 kJ | SW 10 | 0 |
| 204 kJ | E 5 glassy | 2 |

Su escala es **global**: reparte 0-10 sobre todo el planeta, de modo que sólo el
mejor spot del mundo a esa hora llega a 5+. Por eso 1,4 m a 10 s limpio le sale
0-2. Nuestro motor, calibrado contra ella (MAE 0,50 estrellas), reproduce
fielmente ese 2 — y ahí está el problema: **reproducimos bien una escala que no
sirve para nuestra pregunta**, que es "¿merece la pena que me meta hoy aquí?".

La decisión es separar las dos cosas:

- **Datos**: seguimos con Open-Meteo, y el motor sigue derivando energía,
  dirección, periodo y viento igual que hasta ahora.
- **Escala**: pasa a ser de *surfeabilidad local*, anclada a condiciones que un
  surfista reconoce sin mirar una tabla.

### Anclas del Atlántico

Definidas sobre mar limpio y periodo largo (factor de periodo 1), de forma que
el ancla es directamente la nota final:

| Condición | Energía | Nota |
|---|---|---|
| menos de 0,5 m a 10 s | 45 kJ | 0 |
| 0,6 m · 10 s | 70 kJ | 1 |
| 0,8 m · 10 s | 122 kJ | 3 |
| 1,0 m · 10 s | 190 kJ | 5 |
| **1,4 m · 10 s** | **372 kJ** | **7** |
| 2,0 m · 12 s | 1.094 kJ | 9 |
| 2,5 m · 14 s | 2.400 kJ | 10 |

Entre anclas se interpola linealmente en el logaritmo de la energía, que es
donde la percepción de tamaño es lineal. La curva resultante es una S: sube
despacio abajo, deprisa en el rango en que se decide si hay baño, y satura
arriba.

**Coste asumido conscientemente**: la parte alta se comprime. Un día de 4 m a
18 s y otro de 2,5 m a 14 s son los dos un 10. Para una app que responde "¿voy
o no voy?" eso es correcto; para rankear olas gigantes del mundo, no. Esa
segunda pregunta no es la nuestra.

### Anclas del Mediterráneo

Mantienen la parte alta donde estaba (1,5 m a 8 s limpio ≈ 6) y levantan el
suelo, que era el fallo:

| Condición | Energía | Nota |
|---|---|---|
| 0,5 m · 6,5 s | 20 kJ | 0 |
| 0,7 m · 6,6 s | 41 kJ | 1 |
| 0,8 m · 7 s | 60 kJ | 2,5 |
| 1,0 m · 7 s | 93 kJ | 4 |
| 1,5 m · 8 s | 274 kJ | 6 |
| 2,0 m · 9 s | 616 kJ | 8 |
| 2,5 m · 10 s | 1.200 kJ | 10 |

0,4 m a 4 s son 5 kJ, muy por debajo del suelo: cero, como debe ser.

Además el castigo por periodo corto se endurece: por debajo de 5 s ×0,4 (antes
×0,6). Con eso 1 m de chop a 4 s se queda en 0,23 y redondea a 0, que es lo que se
pedía.

### Lo que no cambia

Energía = 1,9·H²·T², ponderación por dirección, factor de viento con rachas,
altura de rompiente Komar-Gaughan, aviso de seguridad por nivel, `swellStars`
como techo sin viento. El script de calibración contra surf-forecast se
conserva como registro histórico, pero ya no define la escala.

## 2. Catálogo: de playas etiquetadas a spots de surf

7.870 puntos vienen de OSM, que etiqueta toda playa con nombre. Tres razones
independientes por las que la mayoría no debe aparecer:

1. **No rompe**: calas dentro de puertos, dársenas, playas de ría sin ventana
   de swell. El filtro de exposición (arco ≥ 90°) ya quita bastantes, pero es
   permisivo.
2. **Es el mismo mar**: la malla del modelo marino ronda los 5 km. Dos playas a
   800 m comparten celda y, por tanto, previsión. Mostrar las dos es precisión
   falsa.
3. **No es un lugar de surf**: puertos deportivos, clubes náuticos, muelles.

El filtro curador aplica, en orden:

1. **Exclusión por tipo y nombre**: `port`, `puerto`, `marina`, `dàrsena`,
   `dársena`, `moll`, `muelle`, `club nàutic/náutico`, `embarcadero`, `dique`,
   `piscina`, `lago`, `embalse`.
2. **Exposición endurecida**: arco de swell ≥ 120° (antes 90°).
3. **Deduplicación por tramo de costa** a 5 km: dentro de cada grupo gana, por
   este orden, (a) estar en la lista curada de breaks conocidos, (b) mayor arco
   de exposición, (c) tipo `Beach` sobre `Bay`/`Shingle`, (d) nombre más corto
   (los nombres largos de OSM suelen ser calas menores).
4. **Lista curada**: breaks reconocidos que sobreviven siempre y dan nombre a
   su tramo, aunque su arco no llegue.

Todo descarte se registra en `spots.catalog-report.json` con su motivo, igual
que hoy, de modo que la reducción es auditable y reversible.

**Honestidad sobre la lista curada**: es conocimiento de surf, no una fuente
verificable como OSM. Por eso no aporta coordenadas —esas siguen viniendo de
OSM, trazables— sino sólo el criterio de qué punto representa cada tramo.

## 3. Estructura de datos: un fichero por país

Hoy `spots.index.json` (7.870 entradas) se importa en el cliente: el navegador
se baja el índice de cuatro países para mirar una región.

Alternativas consideradas:

- **Un único JSON** (hoy): simple, pero crece con cada país y viaja entero al
  cliente.
- **Uno por región**: 56 ficheros, muchos de 10 spots; demasiada fragmentación
  y un import dinámico por cada cambio de región.
- **Uno por país** (elegido): unidad natural de crecimiento, diff de git
  legible, y el cliente sólo carga el país en foco. Cuatro ficheros hoy,
  quince mañana, sin cambiar nada más.

Quedan:

- `src/data/spots/<iso2>.json` — configuración completa, la usan las rutas de
  API en servidor.
- `src/data/spots/<iso2>.index.json` — id, nombre, región, tipo, coordenadas,
  para el mapa y el detalle.
- `src/data/regions.json` — países y sus regiones con número de spots, el único
  fichero que el cliente carga siempre. Es lo que alimenta el selector.

## 4. Selector de país

Chips en fila no escalan. El desplegable de país vive dentro de la misma hoja
Vaul, con buscador cuando hay más de ocho países, agrupando región debajo. Se
mantiene el campo a 16 px para que iOS no haga zoom, y el objetivo táctil a
44 px.
