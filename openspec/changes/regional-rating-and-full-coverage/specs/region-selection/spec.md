## MODIFIED Requirements

### Requirement: El forecast se pide solo de lo visible
El sistema NO SHALL solicitar el forecast de todos los spots de una región al cargarla. SHALL puntuar todos los spots dentro del área visible del mapa, sin un tope que deje spots visibles sin puntuar, agrupándolos en lotes para minimizar las peticiones al proveedor. Un spot NO SHALL dibujarse hasta tener puntuación, y un spot sin datos NO SHALL dibujarse.

#### Scenario: Región extensa
- **WHEN** se selecciona una región con centenares de spots en pantalla
- **THEN** todos los spots visibles con datos acaban dibujados con su puntuación y ninguno queda marcado como sin datos

#### Scenario: Desplazamiento del mapa
- **WHEN** el usuario desplaza o amplía el mapa y entran spots sin puntuar
- **THEN** esos spots se puntúan y se dibujan

#### Scenario: Spot sin datos
- **WHEN** el proveedor no devuelve datos de oleaje para un spot
- **THEN** ese spot no aparece en el mapa
