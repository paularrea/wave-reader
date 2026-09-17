# drawer-navigation Specification

## Purpose
Define cómo se lee y se recorre el detalle de un spot: qué información aparece, cómo se navega entre días y horas sin cerrarlo, y qué debe seguir accesible en una pantalla de móvil.

## Requirements

### Requirement: La acción principal siempre accesible
El enlace para ir al spot SHALL permanecer visible mientras el detalle esté abierto, sin depender de que el usuario haga scroll.

#### Scenario: Detalle abierto en móvil
- **WHEN** el usuario abre el detalle de un spot en una pantalla de móvil
- **THEN** el botón para ir al spot es visible dentro del área visible

### Requirement: Navegación entre días sin salir del detalle
El detalle SHALL permitir cambiar el día del forecast sin cerrarse, a través de las etiquetas de día de la línea temporal, y SHALL indicar qué día está mostrando.

#### Scenario: Cambio de día
- **WHEN** el usuario selecciona otro día dentro del detalle
- **THEN** el detalle permanece abierto, muestra el forecast de ese día y lo marca como activo

#### Scenario: La hora del día se conserva
- **WHEN** el usuario está viendo las 16:00 y salta a otro día
- **THEN** sigue viendo las 16:00 de ese otro día

### Requirement: Navegación entre horas sin salir del detalle
El detalle SHALL permitir avanzar y retroceder el forecast de hora en hora.

#### Scenario: Avance de hora
- **WHEN** el usuario avanza una hora dentro del detalle
- **THEN** la hora mostrada avanza 60 minutos y el contenido se actualiza

#### Scenario: Límites del horizonte
- **WHEN** el usuario está en el primer o el último instante del horizonte disponible
- **THEN** el control correspondiente queda deshabilitado

### Requirement: Dirección representada con flechas
Las magnitudes direccionales SHALL acompañarse de una flecha. La flecha SHALL apuntar en el sentido en que viaja el oleaje o el viento, es decir el recíproco del rumbo de procedencia, mientras la etiqueta sigue nombrando la procedencia.

#### Scenario: Swell del noroeste
- **WHEN** el swell procede de 315 grados
- **THEN** la flecha apunta hacia 135 grados y la etiqueta indica NW

#### Scenario: Sin dirección disponible
- **WHEN** no hay dirección disponible para una magnitud
- **THEN** no se dibuja flecha para esa magnitud

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
Al abrir el detalle de un spot desde el mapa, el forecast SHALL situarse en la primera hora de hoy. Al abrirlo desde "Best in view" SHALL conservar la hora en la que se calculó ese ranking.

#### Scenario: Mapa en otro día
- **WHEN** el usuario tiene el mapa en pasado mañana y pulsa un marcador
- **THEN** el detalle muestra la primera hora de hoy

#### Scenario: Desde los mejores spots
- **WHEN** el usuario tiene el mapa en el sábado a las 09:00 y pulsa un spot de "Best in view"
- **THEN** el detalle muestra el sábado a las 09:00

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

### Requirement: Veredicto y mejor franja
El detalle SHALL resumir la hora mostrada en una frase con la calidad, el tamaño, el tipo de swell y el viento, y SHALL indicar la franja con mejor nota del día mostrado cuando esa nota sea mayor que 0.

#### Scenario: Viento en contra
- **WHEN** hay 1,3 m a 7 s con viento onshore ligero
- **THEN** la frase menciona 1.3 m, swell y onshore

### Requirement: Marea como curva
El detalle SHALL dibujar la curva del nivel del mar del día con la hora mostrada marcada, indicar si sube o baja hacia el próximo extremo y listar las pleamares y bajamares.

#### Scenario: Marea subiendo
- **WHEN** la hora mostrada está entre una bajamar y una pleamar
- **THEN** el detalle indica que sube y la hora de la pleamar
