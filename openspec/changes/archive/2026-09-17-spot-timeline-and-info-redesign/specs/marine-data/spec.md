## ADDED Requirements

### Requirement: Serie horaria completa por spot
El servicio SHALL ofrecer para un spot la previsión de cada hora del horizonte en una sola respuesta, con la puntuación, la puntuación sin viento, el aviso de seguridad para el nivel pedido y las mareas de cada día local. Oleaje y viento SHALL unirse por marca de tiempo.

#### Scenario: Siete días
- **WHEN** se pide la serie de un spot
- **THEN** la respuesta contiene una entrada por hora desde la hora de anclaje hasta 168 horas después, cada una con su puntuación

#### Scenario: Hora sin viento
- **WHEN** el proveedor de viento no tiene una hora que sí tiene el de oleaje
- **THEN** esa hora conserva el oleaje y el viento queda como ausente
