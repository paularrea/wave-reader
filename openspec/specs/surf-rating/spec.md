# surf-rating Specification

## Purpose
Define cómo se calcula la puntuación de 0 a 10 que resume la calidad del surf en un spot y una hora, de forma que refleje si hay olas surfeables y cómo de buenas son, con independencia del nivel de quien consulta.

## Requirements

### Requirement: La puntuación mide el surf, no el nivel del surfista
La puntuación SHALL ser la misma para cualquier nivel de surfista ante las mismas condiciones. El nivel NO SHALL alterar la puntuación.

#### Scenario: Mismo mar, distinto nivel
- **WHEN** se puntúan las mismas condiciones para principiante, intermedio y experto
- **THEN** las tres puntuaciones son idénticas

### Requirement: La energía del oleaje es la base de la puntuación
La puntuación SHALL derivarse de la energía del oleaje, proporcional al cuadrado de la altura por el cuadrado del periodo, sumada sobre todas las componentes disponibles: swell primario, swell secundario y olas de viento. La energía SHALL expresarse en kJ en la misma escala que surf-forecast, y a igual periodo más altura SHALL puntuar más, y a igual altura más periodo SHALL puntuar más.

#### Scenario: Energía calibrada
- **WHEN** se calcula la energía de 2,5 m a 14 s
- **THEN** el resultado está a menos de un 10% de 2.323 kJ, el valor que publica surf-forecast

#### Scenario: El periodo importa
- **WHEN** se comparan 1,5 m a 12 s y 1,5 m a 7 s con el mismo viento y dirección
- **THEN** 1,5 m a 12 s puntúa más

#### Scenario: Componentes sumadas
- **WHEN** además del swell primario hay swell secundario u olas de viento
- **THEN** la energía total incluye la de cada componente

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

### Requirement: El periodo corto penaliza la calidad
Además de su menor energía, un periodo corto SHALL reducir la puntuación, porque produce olas desordenadas. A igual energía, el periodo más corto SHALL puntuar menos. La penalización SHALL variar de forma continua con el periodo, sin escalones, y SHALL desaparecer por completo a partir del periodo al que están definidas las anclas de cada cuenca (10 s en el Atlántico, 6 s en el Mediterráneo), para que las anclas puntúen exactamente lo que declaran.

#### Scenario: Igual energía, distinto periodo
- **WHEN** se comparan 3 m a 6 s y 1,5 m a 12 s, que suman prácticamente la misma energía
- **THEN** 1,5 m a 12 s puntúa más

#### Scenario: Sin salto alrededor del periodo de referencia
- **WHEN** se comparan 2,2 m a 9,9 s y 2,2 m a 10,1 s, limpios y dentro de la ventana
- **THEN** las dos puntuaciones difieren como mucho en 1

#### Scenario: El periodo de las anclas no penaliza
- **WHEN** hay 1,4 m a 10 s limpio dentro de la ventana en un spot atlántico
- **THEN** la puntuación es la misma que a 12 s con la misma energía

### Requirement: La dirección del swell respecto al spot
La energía procedente de dentro de la ventana de swell del spot SHALL contar íntegra. La que llegue de fuera SHALL atenuarse progresivamente según se aleja de la ventana, sin anularse del todo, porque el oleaje refracta.

#### Scenario: Swell fuera de la ventana
- **WHEN** el mismo swell llega de frente al spot y desde 90° fuera de su ventana
- **THEN** el que llega de frente puntúa más, y el de fuera no puntúa más de un tercio de aquel

### Requirement: El viento degrada la puntuación
El viento SHALL evaluarse con la velocidad media, la misma que se muestra al usuario; las rachas NO SHALL entrar en la puntuación. Por debajo de 10 km/h el viento NO SHALL restar en ninguna dirección. Por encima, SHALL restar en proporción a su componente onshore y a su componente cruzada sobre el exceso por encima de 10 km/h, creciendo de forma continua desde cero: el onshore puro SHALL anular la puntuación a 30 km/h y el cruzado puro a 40 km/h. El viento offshore moderado NO SHALL restar. A partir de 45 km/h el viento SHALL restar en cualquier dirección, hasta anular la puntuación a 75 km/h.

#### Scenario: Viento flojo onshore
- **WHEN** a un mar que puntúa 7 se le aplica viento onshore de 2, 5 o 10 km/h
- **THEN** la puntuación es 7

#### Scenario: Onshore moderado
- **WHEN** a un mar que puntúa alto se le aplica viento onshore de 25 km/h
- **THEN** la puntuación cae al menos a la mitad

#### Scenario: Onshore fuerte
- **WHEN** a cualquier mar se le aplica viento onshore de 30 km/h
- **THEN** la puntuación es 0

#### Scenario: Offshore ligero
- **WHEN** el viento es offshore de 15 km/h
- **THEN** la puntuación es igual a la potencial

#### Scenario: Temporal
- **WHEN** el viento supera los 75 km/h en cualquier dirección
- **THEN** la puntuación es 0

#### Scenario: Viento desconocido
- **WHEN** no hay dato de viento
- **THEN** la puntuación es igual a la potencial

#### Scenario: Racheo normal
- **WHEN** la racha es la habitual para ese viento medio
- **THEN** la puntuación es la misma que sin considerar rachas

#### Scenario: Racheo fuerte
- **WHEN** con el mismo viento medio y dirección la racha es muy superior a la habitual
- **THEN** la puntuación es la misma que con racheo normal, porque las rachas no puntúan

#### Scenario: Sin escalón en el umbral de calma
- **WHEN** el viento onshore pasa de 9 a 11 km/h sobre un mar que puntúa 7
- **THEN** la puntuación baja como mucho 1

### Requirement: Puntuación potencial
El sistema SHALL exponer, junto a la puntuación, la puntuación potencial que tendría el mar sin el efecto del viento, y la energía total en kJ. La puntuación nunca SHALL superar la potencial. La potencial es un dato para el sistema (p. ej. el mapa); el detalle del spot NO SHALL estar obligado a mostrarla.

#### Scenario: Viento que estropea el mar
- **WHEN** un buen swell coincide con viento onshore
- **THEN** la puntuación potencial expuesta es mayor que la puntuación

#### Scenario: Viento que no resta
- **WHEN** el viento es menor de 10 km/h
- **THEN** la puntuación es igual a la potencial

### Requirement: Sin datos no hay puntuación
Cuando no haya altura de ninguna componente del oleaje, el sistema SHALL marcar la hora como sin puntuar en lugar de devolver 0.

#### Scenario: Sin datos de oleaje
- **WHEN** todas las alturas de oleaje son nulas
- **THEN** el resultado se marca como sin puntuar

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

### Requirement: Entradas casi iguales dan notas casi iguales
La puntuación SHALL variar de forma continua con cada magnitud de entrada, de modo que diferencias por debajo de la precisión del pronóstico no produzcan saltos visibles. Sobre el horizonte completo de un conjunto de regiones de referencia, los pares de horas consecutivas de un mismo spot con pronóstico visualmente idéntico (altura mostrada a ±0,1 m, mismo periodo redondeado y viento a ±3 km/h) que difieran en 3 o más SHALL ser como mucho el 0,1 %. El sistema SHALL incluir una medición reproducible de esta métrica.

#### Scenario: Medición de estabilidad
- **WHEN** se ejecuta la medición sobre País Vasco, Cantabria, Nouvelle-Aquitaine, Cornwall y Cataluña con el horizonte completo
- **THEN** los saltos de 3 o más entre horas visualmente idénticas son como mucho el 0,1 % de los pares
