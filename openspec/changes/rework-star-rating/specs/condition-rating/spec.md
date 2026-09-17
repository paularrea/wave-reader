## MODIFIED Requirements

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
