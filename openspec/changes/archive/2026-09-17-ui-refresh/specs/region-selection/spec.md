## ADDED Requirements

### Requirement: Selector de región
La región SHALL elegirse desde un selector con búsqueda por nombre, pestañas por país, lista de regiones con su número de spots y la opción de usar la ubicación. La región actual SHALL marcarse.

#### Scenario: Buscar una región
- **WHEN** el usuario escribe "cant" en la búsqueda
- **THEN** la lista muestra Cantabria

#### Scenario: Elegir una región
- **WHEN** el usuario elige una región de otro país
- **THEN** el selector se cierra, la región y el país cambian y el mapa se encuadra en ella

### Requirement: Mejores spots a la vista
El mapa SHALL mostrar los tres spots con mejor nota entre los visibles a la hora elegida, y al pulsar uno SHALL abrir su detalle en esa misma hora. Si ninguno puntúa por encima de 0 SHALL decirlo.

#### Scenario: Abrir el mejor spot
- **WHEN** el usuario pulsa el primer spot de "Best in view"
- **THEN** se abre su detalle a la hora que estaba mirando

### Requirement: Mejor nota por día
Cada día de la tira de días SHALL indicar la mejor nota de ese día entre los spots visibles puntuados.

#### Scenario: Un día bueno
- **WHEN** algún spot visible puntúa 5 el sábado
- **THEN** el indicador del sábado usa el color épico
