## ADDED Requirements

### Requirement: La escala reproduce la de surf-forecast
La puntuación de 0 a 10 SHALL aproximar la que surf-forecast publica para las mismas condiciones de oleaje y viento. La calibración SHALL validarse dejando fuera de cada ajuste el spot con el que se mide, y el error medio validado SHALL ser inferior a 1 estrella.

#### Scenario: Mar limpio de tamaño medio
- **WHEN** hay 1,5 m a 12 s sin viento
- **THEN** la puntuación está entre 2 y 4

#### Scenario: Buen swell de fondo
- **WHEN** hay 2,5 m a 14 s sin viento
- **THEN** la puntuación está entre 4 y 6

#### Scenario: Casos reales de surf-forecast
- **WHEN** se puntúan los casos de referencia extraídos de surf-forecast
- **THEN** al menos el 85% queda a una estrella o menos de la nota publicada

#### Scenario: Mar de fondo muy grande
- **WHEN** la energía aumenta sin viento
- **THEN** la puntuación no disminuye

## MODIFIED Requirements

### Requirement: El viento degrada la puntuación
El viento SHALL restar puntuación en proporción a su componente onshore y a su fuerza. El viento ligero o offshore moderado NO SHALL restar. El viento muy fuerte SHALL anular la puntuación en cualquier dirección. La fuerza evaluada SHALL tener en cuenta las rachas: cuando la racha supere lo habitual para el viento medio, SHALL usarse la racha normalizada.

#### Scenario: Onshore moderado
- **WHEN** a un mar que puntúa alto se le aplica viento onshore de 25 km/h
- **THEN** la puntuación cae al menos a la mitad

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
- **WHEN** con el mismo viento medio cruzado la racha es muy superior a la habitual
- **THEN** la puntuación es menor o igual que con racheo normal
