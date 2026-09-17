## ADDED Requirements

### Requirement: Lotes del mapa con todo el horizonte
Cada lote de puntuación del mapa SHALL devolver, para cada spot, la nota, el tamaño y el periodo de cada hora del horizonte junto con la hora UTC del primer valor, de forma que cambiar de hora no requiera nuevas peticiones.

#### Scenario: Mover el slider
- **WHEN** los lotes visibles ya están cargados y el usuario cambia de hora
- **THEN** los marcadores se actualizan sin nuevas peticiones al servidor
