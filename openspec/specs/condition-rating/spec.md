# condition-rating Specification

## Purpose
Traduce la puntuación numérica de condiciones a señales visuales coherentes en toda la aplicación y avisa al surfista cuando las condiciones superan su nivel, que es la función de seguridad del producto.

## Requirements

### Requirement: Escala de calidad legible de un vistazo
La calidad SHALL representarse en tres niveles claramente distinguibles: excelente (8 a 10), aceptable (5 a 7) y pobre (por debajo de 5). Los niveles SHALL diferenciarse por más de un canal visual a la vez — color, tamaño y realce — y NO SHALL distinguirse únicamente por la opacidad de un mismo color, que resulta indistinguible sobre un mapa oscuro. NO SHALL usarse verde en ninguna superficie que represente calidad.

#### Scenario: Los tres niveles se distinguen por tamaño
- **WHEN** se comparan marcadores de un spot excelente, uno aceptable y uno pobre
- **THEN** el excelente se dibuja mayor que el aceptable y este mayor que el pobre, y los tres usan colores distintos

#### Scenario: Solo lo excelente destaca
- **WHEN** un spot puntúa 8 o más
- **THEN** su marcador lleva realce luminoso y muestra su puntuación; los de puntuación inferior a 5 no muestran puntuación

#### Scenario: Ausencia de verde
- **WHEN** se inspecciona cualquier marcador o indicador de calidad
- **THEN** ninguno usa un color verde

#### Scenario: Sin datos no es mala puntuación
- **WHEN** un spot no tiene forecast disponible
- **THEN** su marcador se dibuja hueco y se distingue de un spot con mala puntuación

### Requirement: Leyenda de la escala
La interfaz SHALL mostrar una leyenda que explique qué representa cada nivel de la escala y su rango de puntuación.

#### Scenario: Leyenda visible
- **WHEN** el usuario abre la aplicación
- **THEN** ve una leyenda con los niveles de calidad y el aviso de peligro

### Requirement: Badge de condición de viento legible
La condición de viento SHALL mostrarse como un badge con una de estas categorías y colores: `On-shore` en gris, `Cross-shore` en verde claro, `Off-shore` en verde, `Glass` en verde. El badge SHALL acompañarse siempre de la fuerza y la dirección del viento.

#### Scenario: Viento offshore
- **WHEN** la dirección del viento coincide con el ángulo offshore del spot dentro de su tolerancia y hay viento apreciable
- **THEN** se muestra el badge `Off-shore` en verde junto a la fuerza en km/h y la dirección

#### Scenario: Viento onshore
- **WHEN** la dirección del viento es opuesta al ángulo offshore del spot dentro de su tolerancia
- **THEN** se muestra el badge `On-shore` en gris

#### Scenario: Mar plancha
- **WHEN** la velocidad del viento está disponible y es inferior a 5 km/h
- **THEN** se muestra el badge `Glass`

### Requirement: Gradiente de altura de ola
La altura de ola SHALL representarse con un gradiente de azul que va de claro a oscuro conforme aumenta la altura.

#### Scenario: Olas pequeñas frente a grandes
- **WHEN** se comparan un spot con olas pequeñas y otro con olas grandes
- **THEN** el de olas pequeñas se representa en un azul más claro que el de olas grandes

### Requirement: Alerta de seguridad para el nivel del surfista
Cuando las condiciones excedan el rango seguro del nivel declarado por el surfista, el sistema SHALL mostrar una alerta en rojo que explique por qué esas condiciones son peligrosas en ese spot concreto, citando la magnitud que dispara el aviso y el límite superado. La magnitud evaluada SHALL ser la altura de rompiente estimada a partir de la altura y el periodo, no la altura en aguas profundas: a igual altura, un periodo largo rompe mucho más grande. La alerta SHALL ser visible tanto en el detalle del spot como en su marcador del mapa.

#### Scenario: Principiante con olas fuera de rango
- **WHEN** el surfista tiene nivel principiante y la altura de rompiente estimada supera el máximo seguro para ese nivel
- **THEN** el detalle muestra una alerta roja que indica la altura de rompiente estimada, el límite para principiantes y el motivo del riesgo

#### Scenario: El periodo largo dispara la alerta
- **WHEN** el surfista es principiante y hay 1,2 m a 14 s
- **THEN** se muestra la alerta, aunque 1,2 m no supere el límite en aguas profundas

#### Scenario: La alerta llega al mapa
- **WHEN** un spot está en condición peligrosa para el nivel declarado
- **THEN** su marcador en el mapa se distingue en rojo del resto de marcadores

#### Scenario: Nivel adecuado sin alerta
- **WHEN** el surfista tiene nivel experto y la altura de rompiente está dentro de su rango
- **THEN** no se muestra ninguna alerta de peligro
