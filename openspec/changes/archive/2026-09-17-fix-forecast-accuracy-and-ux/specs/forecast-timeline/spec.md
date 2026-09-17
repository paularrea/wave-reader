## Purpose

Define cómo el usuario selecciona el instante del forecast, de modo que en todo momento sepa sin ambigüedad qué día y qué hora local del spot está consultando.

## ADDED Requirements

### Requirement: Anclaje a la hora en curso
La línea temporal SHALL arrancar en la hora actual redondeada hacia arriba a la hora en punto siguiente en la zona horaria del spot.

#### Scenario: Redondeo hacia arriba
- **WHEN** la hora local del spot es 14:20 y el usuario abre la aplicación
- **THEN** la posición inicial de la línea temporal corresponde a las 15:00 del mismo día

#### Scenario: Redondeo en hora en punto
- **WHEN** la hora local del spot es 17:00 exactas
- **THEN** la posición inicial de la línea temporal corresponde a las 17:00

### Requirement: Granularidad horaria
La línea temporal SHALL avanzar en pasos de una hora exacta. Todo instante seleccionable SHALL caer en una hora en punto.

#### Scenario: Un paso avanza una hora
- **WHEN** el usuario avanza una posición en la línea temporal
- **THEN** el instante mostrado avanza exactamente 60 minutos y cae en una hora en punto

### Requirement: Zona horaria del spot
El instante mostrado SHALL expresarse en la zona horaria correspondiente a las coordenadas del spot seleccionado, no en la del navegador.

#### Scenario: Spot en otra zona horaria
- **WHEN** el usuario consulta un spot de Canarias desde un navegador configurado en horario peninsular
- **THEN** la hora mostrada es la hora local canaria del spot

### Requirement: Agrupación por días
La línea temporal SHALL indicar a qué día pertenece el instante seleccionado y SHALL marcar visualmente la frontera entre días. Los días SHALL etiquetarse de forma legible, distinguiendo el día actual del siguiente y de los posteriores.

#### Scenario: Etiqueta del día actual
- **WHEN** el instante seleccionado pertenece al día actual en la zona horaria del spot
- **THEN** la línea temporal lo etiqueta como hoy junto a la hora

#### Scenario: Salto al día siguiente
- **WHEN** el usuario avanza desde las 23:00 una posición
- **THEN** el instante mostrado es las 00:00 y la etiqueta de día cambia al día siguiente

#### Scenario: Días posteriores identificables
- **WHEN** el instante seleccionado está a más de dos días vista
- **THEN** la etiqueta identifica el día concreto por su nombre y fecha
