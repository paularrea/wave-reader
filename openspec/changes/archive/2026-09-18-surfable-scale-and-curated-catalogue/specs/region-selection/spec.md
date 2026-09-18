## MODIFIED Requirements

### Requirement: Selector de región
La región SHALL elegirse desde un selector con búsqueda por nombre, lista de regiones con su número de spots y la opción de usar la ubicación. El país SHALL elegirse en un desplegable dentro del mismo selector, y NO SHALL presentarse como una fila fija de opciones, de forma que la interfaz no cambie al crecer el número de países. Cuando haya más de ocho países, el desplegable SHALL ofrecer búsqueda. La región actual SHALL marcarse.

#### Scenario: Buscar una región
- **WHEN** el usuario escribe "cant" en la búsqueda
- **THEN** la lista muestra Cantabria

#### Scenario: Elegir una región
- **WHEN** el usuario elige una región de otro país
- **THEN** el selector se cierra, la región y el país cambian y el mapa se encuadra en ella

#### Scenario: Desplegar el país
- **WHEN** el usuario abre el desplegable de país
- **THEN** ve la lista completa de países del catálogo y puede elegir uno sin salir de la hoja

#### Scenario: Cambiar de país
- **WHEN** el usuario elige un país distinto en el desplegable
- **THEN** la lista de regiones pasa a ser la de ese país

### Requirement: Mejores spots a la vista
El mapa SHALL mostrar los tres spots con mejor nota entre los visibles a la hora elegida, y al pulsar uno SHALL abrir su detalle en esa misma hora. Si ninguno puntúa por encima de 0, la sección SHALL ocultarse en lugar de mostrarse vacía.

#### Scenario: Abrir el mejor spot
- **WHEN** el usuario pulsa el primer spot de "Best in view"
- **THEN** se abre su detalle a la hora que estaba mirando

#### Scenario: Nada surfeable a la vista
- **WHEN** ningún spot visible puntúa por encima de 0 a la hora elegida
- **THEN** la sección de mejores spots no se muestra

### Requirement: Mejor nota por día
Cada día de la tira de días SHALL indicar la mejor nota de ese día entre los spots visibles puntuados.

#### Scenario: Un día bueno
- **WHEN** algún spot visible puntúa 7 el sábado
- **THEN** el indicador del sábado usa el color épico
