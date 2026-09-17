## ADDED Requirements

### Requirement: Línea temporal de pills en el detalle
El detalle SHALL mostrar una línea temporal con una pill vertical por franja de 3 horas hasta el final del horizonte. La altura de cada pill SHALL ser proporcional al tamaño de ola entre 0 y 3 m y SHALL mantenerse al máximo por encima de 3 m. El color SHALL ir de gris (nota 0) a amarillo (nota 5 o más) de forma continua. Una franja sin datos SHALL dibujarse hueca. En una pantalla de 375 px de ancho SHALL caber al menos 3 días sin desplazar.

#### Scenario: Un día mejor que hoy se ve sin navegar
- **WHEN** hoy la nota es 0 y dentro de dos días es 5
- **THEN** las pills de hoy son grises y las de ese día amarillas, visibles al abrir el detalle

#### Scenario: Olas por encima de 3 m
- **WHEN** una franja tiene 4,5 m y otra 3 m
- **THEN** ambas pills tienen la altura máxima

#### Scenario: Seleccionar una franja
- **WHEN** el usuario pulsa una pill
- **THEN** el detalle muestra la previsión de la primera hora disponible de esa franja y la pill queda marcada

#### Scenario: Móvil
- **WHEN** se abre el detalle en una pantalla de 375 px de ancho
- **THEN** al menos 3 días de pills son visibles sin desplazamiento horizontal

### Requirement: Abrir un spot empieza por hoy
Al abrir el detalle de un spot, el forecast SHALL situarse en la primera hora del horizonte de hoy, sea cual sea la hora seleccionada antes.

#### Scenario: Mapa en otro día
- **WHEN** el usuario tiene el mapa en pasado mañana y abre un spot
- **THEN** el detalle muestra la primera hora de hoy

### Requirement: Carga fiable del detalle
El detalle SHALL cargar la previsión completa del spot una sola vez y cambiar de hora sin nuevas peticiones. Si la carga falla SHALL reintentar automáticamente con espera creciente y, si sigue fallando, SHALL mostrar un error con un botón para reintentar. Mientras carga SHALL indicarlo y nunca SHALL mostrar datos de otra hora u otro spot.

#### Scenario: Cambio de hora
- **WHEN** la previsión del spot ya está cargada y el usuario cambia de hora
- **THEN** el contenido se actualiza sin pedir datos de nuevo

#### Scenario: Fallo transitorio
- **WHEN** la primera petición falla y la segunda responde
- **THEN** el detalle muestra la previsión sin intervención del usuario

#### Scenario: Fallo persistente
- **WHEN** todas las peticiones fallan
- **THEN** el detalle muestra un mensaje de error con un botón para reintentar

## MODIFIED Requirements

### Requirement: Navegación entre días sin salir del detalle
El detalle SHALL permitir cambiar el día del forecast sin cerrarse, a través de las etiquetas de día de la línea temporal, y SHALL indicar qué día está mostrando.

#### Scenario: Cambio de día
- **WHEN** el usuario selecciona otro día dentro del detalle
- **THEN** el detalle permanece abierto, muestra el forecast de ese día y lo marca como activo

#### Scenario: La hora del día se conserva
- **WHEN** el usuario está viendo las 16:00 y salta a otro día
- **THEN** sigue viendo las 16:00 de ese otro día
