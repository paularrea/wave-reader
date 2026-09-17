## ADDED Requirements

### Requirement: Racha de viento
El forecast SHALL exponer la racha de viento en km/h, procedente del endpoint meteorológico, con el mismo tratamiento de ausencia que el resto de magnitudes.

#### Scenario: Racha disponible
- **WHEN** el proveedor devuelve racha para la hora consultada
- **THEN** la respuesta la expone en km/h sin reescalar

#### Scenario: Racha ausente
- **WHEN** el proveedor no devuelve racha
- **THEN** la racha se expone como ausente y la puntuación usa solo el viento medio
