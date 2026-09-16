## Purpose

Traduce la puntuación numérica de condiciones a señales visuales coherentes en toda la aplicación y avisa al surfista cuando las condiciones superan su nivel, que es la función de seguridad del producto.

## ADDED Requirements

### Requirement: Escala de calidad monocroma amarilla
La calidad de las condiciones SHALL representarse mediante una única tonalidad amarilla cuya opacidad crece con la puntuación. NO SHALL usarse verde en ninguna superficie que represente calidad de condiciones, incluidos los marcadores del mapa.

#### Scenario: Mayor puntuación, mayor opacidad
- **WHEN** se comparan dos spots, uno con puntuación alta y otro con puntuación baja
- **THEN** ambos se representan en la misma tonalidad amarilla y el de puntuación alta se muestra con mayor opacidad

#### Scenario: Ausencia de verde
- **WHEN** se inspecciona cualquier marcador del mapa o indicador de calidad del detalle
- **THEN** ninguno usa un color verde

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
Cuando las condiciones excedan el rango seguro del nivel declarado por el surfista, el sistema SHALL mostrar una alerta en rojo que explique por qué esas condiciones son peligrosas en ese spot concreto, citando la magnitud que dispara el aviso y el límite superado. La alerta SHALL ser visible tanto en el detalle del spot como en su marcador del mapa.

#### Scenario: Principiante con olas fuera de rango
- **WHEN** el surfista tiene nivel principiante y la altura de ola supera el máximo seguro del spot para ese nivel
- **THEN** el detalle muestra una alerta roja que indica la altura prevista, el límite del spot para principiantes y el motivo del riesgo

#### Scenario: La alerta llega al mapa
- **WHEN** un spot está en condición peligrosa para el nivel declarado
- **THEN** su marcador en el mapa se distingue en rojo del resto de marcadores

#### Scenario: Nivel adecuado sin alerta
- **WHEN** el surfista tiene nivel experto y la altura de ola está dentro de su rango
- **THEN** no se muestra ninguna alerta de peligro
