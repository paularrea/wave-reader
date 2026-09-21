## MODIFIED Requirements

### Requirement: Veredicto y mejor franja
El detalle SHALL resumir la hora mostrada en una frase con la calidad, el tamaño, el tipo de swell y el viento, y SHALL indicar la franja con mejor nota del día mostrado cuando esa nota sea mayor que 0. La calidad SHALL nombrarse con el nombre único del nivel (Epic, Fair, Poor; `Flat` y `Blown out` como tipos concretos de Poor). El viento SHALL describirse con la misma lectura que la puntuación: "no wind" con badge `Glass`, "light" solo por debajo de 10 km/h, que es cuando el viento no resta, y dirección respecto al spot (onshore, offshore, cross-shore) y fuerza siempre que el viento reste. El detalle NO SHALL mostrar una línea con la puntuación potencial o con lo que resta el viento: la explicación la dan el veredicto y el badge de viento.

#### Scenario: Viento en contra
- **WHEN** hay 1,3 m a 7 s con viento onshore de 7 km/h
- **THEN** la frase menciona 1.3 m, swell, light y onshore

#### Scenario: El viento resta
- **WHEN** hay 1,4 m a 12 s con viento onshore de 18 km/h
- **THEN** la frase menciona onshore y una fuerza distinta de light

#### Scenario: Nombre de nivel en el veredicto
- **WHEN** la hora mostrada puntúa 7
- **THEN** la frase empieza por Epic

#### Scenario: Sin línea de potencial
- **WHEN** la puntuación es menor que la potencial
- **THEN** el detalle no muestra ninguna línea con la puntuación potencial ni con lo que resta el viento
