## MODIFIED Requirements

### Requirement: Lógica de la puntuación
El panel SHALL explicar en lenguaje llano qué entra en la nota, las anclas de la escala por cuenca (condiciones reconocibles y la nota que obtienen), qué significan los niveles del mapa y cuándo salta el aviso de seguridad. La explicación del viento SHALL coincidir con el cálculo: se usa el viento medio, las rachas no cuentan, por debajo de 10 km/h no resta en ninguna dirección, onshore y cross-shore restan de forma progresiva y el viento muy fuerte anula la nota en cualquier dirección. El panel NO SHALL presentar la escala como calibrada contra un servicio de terceros.

#### Scenario: Calibración visible
- **WHEN** el usuario lee la sección de puntuación
- **THEN** ve las anclas de cada cuenca con la nota que obtienen, y ninguna mención a una calibración o un error medio frente a un servicio de terceros

#### Scenario: Viento explicado como se calcula
- **WHEN** el usuario lee cómo influye el viento
- **THEN** el texto dice que las rachas no cuentan y que por debajo de 10 km/h el viento no resta
