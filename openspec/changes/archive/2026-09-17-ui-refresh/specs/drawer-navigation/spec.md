## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Abrir un spot empieza por hoy
Al abrir el detalle de un spot desde el mapa, el forecast SHALL situarse en la primera hora de hoy. Al abrirlo desde "Best in view" SHALL conservar la hora en la que se calculó ese ranking.

#### Scenario: Mapa en otro día
- **WHEN** el usuario tiene el mapa en pasado mañana y pulsa un marcador
- **THEN** el detalle muestra la primera hora de hoy

#### Scenario: Desde los mejores spots
- **WHEN** el usuario tiene el mapa en el sábado a las 09:00 y pulsa un spot de "Best in view"
- **THEN** el detalle muestra el sábado a las 09:00
