## ADDED Requirements

### Requirement: Escala propia del Mediterráneo
Los spots del mar Mediterráneo SHALL puntuarse con una escala calibrada para ese mar, en el que no se dan los swells largos del Atlántico. El resto de spots SHALL seguir usando la escala calibrada contra surf-forecast. La cuenca SHALL determinarse a partir de las coordenadas del spot.

#### Scenario: Día normal bueno en el Mediterráneo
- **WHEN** un spot mediterráneo tiene 1 m a 7 s sin viento
- **THEN** la puntuación está entre 2 y 3

#### Scenario: Con cross-off moderado
- **WHEN** un spot mediterráneo tiene 1 m a 7 s con viento cross-offshore de 15 km/h
- **THEN** la puntuación está entre 2 y 3

#### Scenario: Buen día mediterráneo
- **WHEN** un spot mediterráneo tiene 1,5 m a 8 s sin viento
- **THEN** la puntuación está entre 5 y 6

#### Scenario: Mar plano mediterráneo
- **WHEN** un spot mediterráneo tiene 0,3 m a 4 s
- **THEN** la puntuación es 0

#### Scenario: Mismo mar, cuencas distintas
- **WHEN** el mismo mar de 1,5 m a 8 s sin viento se puntúa en un spot atlántico y en uno mediterráneo
- **THEN** el mediterráneo puntúa más

#### Scenario: Clasificación por coordenadas
- **WHEN** se clasifican Barcelona, Málaga, Mallorca y Marsella frente a Zarautz, Cádiz, Biarritz y Newquay
- **THEN** los cuatro primeros son mediterráneos y los cuatro últimos no
