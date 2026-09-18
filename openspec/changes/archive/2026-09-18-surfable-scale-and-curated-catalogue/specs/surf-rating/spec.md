## REMOVED Requirements

### Requirement: La escala reproduce la de surf-forecast
**Reason**: La escala de estrellas de surf-forecast es global: reparte 0-10 sobre todos los spots del planeta, de modo que 1,4 m a 10 s limpio puntúa 0-2 en sus propias tablas. Reproducirla fielmente contestaba a la pregunta equivocada. La app responde "¿merece la pena el baño de hoy aquí?", no "¿cómo se compara esto con Nazaré?".
**Migration**: La sustituye "La escala mide la surfeabilidad del baño". La física del motor —energía, dirección, periodo, viento, rompiente— no cambia; cambia sólo la curva que traduce energía en nota. El banco de casos de surf-forecast y `scripts/calibrate-rating.mjs` se conservan como registro histórico de la calibración anterior.

## ADDED Requirements

### Requirement: La escala mide la surfeabilidad del baño
La puntuación SHALL medir cómo de bueno es el baño en ese spot y esa hora, anclada a condiciones que un surfista reconoce, y NO SHALL perseguir la escala de ningún servicio de terceros. La traducción de energía a nota SHALL definirse por anclas explícitas por cuenca, interpolando en el logaritmo de la energía, y SHALL ser monótona: a más energía, nunca menos nota.

#### Scenario: Día bueno de Atlántico
- **WHEN** hay 1,4 m a 10 s dentro de la ventana de swell con viento offshore flojo
- **THEN** la puntuación es 7 o más

#### Scenario: Mar pequeño pero surfeable
- **WHEN** hay 1,0 m a 10 s limpio dentro de la ventana
- **THEN** la puntuación está entre 4 y 6

#### Scenario: Mar limpio de tamaño medio
- **WHEN** hay 1,5 m a 12 s sin viento
- **THEN** la puntuación está entre 7 y 9

#### Scenario: La escala satura arriba
- **WHEN** se comparan 2,5 m a 14 s y 4 m a 18 s, ambos limpios
- **THEN** ninguno puntúa por debajo de 9 y el mayor no puntúa menos que el menor

#### Scenario: Mar de fondo muy grande
- **WHEN** la energía aumenta sin viento
- **THEN** la puntuación no disminuye

## MODIFIED Requirements

### Requirement: El mar plano puntúa cero
Cuando la energía total no alcance el umbral de mar surfeable de su cuenca, la puntuación SHALL ser 0 con independencia del viento. En el Mediterráneo el oleaje de periodo inferior a 5 segundos NO SHALL alcanzar puntuación, porque es chop sin forma de ola.

#### Scenario: Mar de viento diminuto
- **WHEN** hay 0,3 m a 3 s con viento offshore ligero
- **THEN** la puntuación es 0

#### Scenario: Plancha sin olas
- **WHEN** hay 0,2 m a 4 s y viento en calma
- **THEN** la puntuación es 0

#### Scenario: Chop mediterráneo
- **WHEN** en el Mediterráneo hay 0,4 m a 4 s con viento en calma
- **THEN** la puntuación es 0

#### Scenario: Chop mediterráneo de un metro
- **WHEN** en el Mediterráneo hay 1,0 m a 4 s con viento en calma
- **THEN** la puntuación es 0

### Requirement: Escala propia del Mediterráneo
Los spots del mar Mediterráneo SHALL puntuarse con anclas propias de ese mar, en el que no se dan los swells largos del Atlántico. La cuenca SHALL determinarse a partir de las coordenadas del spot. Una marejada corta pero con forma SHALL puntuar; el chop sin forma, no.

#### Scenario: Marejadilla limpia
- **WHEN** un spot mediterráneo tiene 0,8 m a 7 s con viento offshore flojo
- **THEN** la puntuación es 2 o más

#### Scenario: Día normal bueno en el Mediterráneo
- **WHEN** un spot mediterráneo tiene 1 m a 7 s sin viento
- **THEN** la puntuación está entre 3 y 5

#### Scenario: Con cross-off moderado
- **WHEN** un spot mediterráneo tiene 1 m a 7 s con viento cross-offshore de 15 km/h
- **THEN** la puntuación está entre 2 y 4

#### Scenario: Buen día mediterráneo
- **WHEN** un spot mediterráneo tiene 1,5 m a 8 s sin viento
- **THEN** la puntuación está entre 5 y 7

#### Scenario: Mar plano mediterráneo
- **WHEN** un spot mediterráneo tiene 0,3 m a 4 s
- **THEN** la puntuación es 0

#### Scenario: Mismo mar, cuencas distintas
- **WHEN** el mismo mar de 1,5 m a 8 s sin viento se puntúa en un spot atlántico y en uno mediterráneo
- **THEN** el mediterráneo puntúa más, porque para ese mar es un día grande

#### Scenario: Clasificación por coordenadas
- **WHEN** se clasifican Barcelona, Málaga, Mallorca y Marsella frente a Zarautz, Cádiz, Biarritz y Newquay
- **THEN** los cuatro primeros son mediterráneos y los cuatro últimos no
