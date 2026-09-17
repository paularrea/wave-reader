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
El detalle SHALL permitir cambiar el día del forecast sin cerrarse, y SHALL indicar qué día está mostrando.

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
