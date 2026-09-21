## MODIFIED Requirements

### Requirement: Escala de calidad legible de un vistazo
La calidad SHALL representarse en tres niveles claramente distinguibles, cada uno con un único nombre visible en toda la interfaz (marcadores, recuadro de la nota, veredicto y leyenda): **Epic** (6 a 10), **Fair** (1 a 5) y **Poor** (0). Los umbrales siguen la escala de surfeabilidad: 6 corresponde a 1,2 m a 10 s limpio, el punto en el que un surfista cambia de planes para ir. Los niveles SHALL diferenciarse por más de un canal visual a la vez — color, tamaño y realce — y NO SHALL distinguirse únicamente por la opacidad de un mismo color, que resulta indistinguible sobre un mapa oscuro. NO SHALL usarse verde en ninguna superficie que represente calidad.

#### Scenario: Los tres niveles se distinguen por tamaño
- **WHEN** se comparan marcadores de un spot Epic, uno Fair y uno Poor
- **THEN** el Epic se dibuja mayor que el Fair y este mayor que el Poor, y los tres usan colores distintos

#### Scenario: Solo lo excelente destaca
- **WHEN** un spot puntúa 6 o más
- **THEN** su marcador lleva realce luminoso y muestra su puntuación; los de puntuación 0 no muestran puntuación

#### Scenario: Un nombre por nivel
- **WHEN** un spot puntúa 7 y se abre su detalle
- **THEN** el recuadro de la nota y el veredicto lo llaman Epic, y ningún texto visible usa `Excellent` ni `Surfable`

#### Scenario: Ausencia de verde
- **WHEN** se inspecciona cualquier marcador o indicador de calidad
- **THEN** ninguno usa un color verde

#### Scenario: Sin datos no es mala puntuación
- **WHEN** un spot no tiene forecast disponible
- **THEN** su marcador se dibuja hueco y se distingue de un spot con mala puntuación

### Requirement: Badge de condición de viento legible
La condición de viento SHALL mostrarse como un badge con una de estas categorías y colores: `Glass` en verde por debajo de 5 km/h, `Light` en verde de 5 a 10 km/h en cualquier dirección y, a partir de 10 km/h, `Offshore` en verde, `Cross-shore` en verde claro u `Onshore` en gris según la dirección respecto al spot. Los badges `Glass` y `Light` SHALL significar que el viento no resta puntuación. El badge SHALL acompañarse siempre de la fuerza y la dirección del viento, y la fuerza mostrada SHALL ser la misma que usa la puntuación. La interfaz SHALL escribir siempre onshore, offshore y cross-shore, sin la variante con guion `On-shore` / `Off-shore`.

#### Scenario: Viento offshore
- **WHEN** la dirección del viento coincide con el ángulo offshore del spot dentro de su tolerancia y el viento es de 10 km/h o más
- **THEN** se muestra el badge `Offshore` en verde junto a la fuerza en km/h y la dirección

#### Scenario: Viento onshore
- **WHEN** la dirección del viento es opuesta al ángulo offshore del spot dentro de su tolerancia y el viento es de 10 km/h o más
- **THEN** se muestra el badge `Onshore` en gris

#### Scenario: Mar plancha
- **WHEN** la velocidad del viento está disponible y es inferior a 5 km/h
- **THEN** se muestra el badge `Glass`

#### Scenario: Viento flojo en contra
- **WHEN** el viento es onshore de 7 km/h
- **THEN** se muestra el badge `Light`, no `Onshore`, y la puntuación es igual a la potencial

#### Scenario: El badge verde no convive con pérdida por viento
- **WHEN** se recorren todas las horas de un spot con badge `Glass` o `Light`
- **THEN** en ninguna la puntuación es menor que la potencial
