## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Entradas casi iguales dan notas casi iguales
La puntuación SHALL variar de forma continua con cada magnitud de entrada, de modo que diferencias por debajo de la precisión del pronóstico no produzcan saltos visibles. Sobre el horizonte completo de un conjunto de regiones de referencia, los pares de horas consecutivas de un mismo spot con pronóstico visualmente idéntico (altura mostrada a ±0,1 m, mismo periodo redondeado y viento a ±3 km/h) que difieran en 3 o más SHALL ser como mucho el 0,1 %. El sistema SHALL incluir una medición reproducible de esta métrica.

#### Scenario: Medición de estabilidad
- **WHEN** se ejecuta la medición sobre País Vasco, Cantabria, Nouvelle-Aquitaine, Cornwall y Cataluña con el horizonte completo
- **THEN** los saltos de 3 o más entre horas visualmente idénticas son como mucho el 0,1 % de los pares
