## Purpose

Permite al surfista saber a qué hora se produce la pleamar y la bajamar del día en un spot, que condiciona qué spots funcionan y cuáles son peligrosos, a partir de la serie horaria de nivel del mar.

## ADDED Requirements

### Requirement: Detección de pleamar y bajamar
El sistema SHALL identificar los extremos locales de la serie horaria de nivel del mar de un día y clasificarlos como pleamar (máximo local) o bajamar (mínimo local).

#### Scenario: Día con dos ciclos
- **WHEN** la serie de nivel del mar de un día presenta dos máximos y dos mínimos locales
- **THEN** el sistema devuelve cuatro extremos, dos marcados como pleamar y dos como bajamar, cada uno con su hora

#### Scenario: Extremos ordenados
- **WHEN** el sistema devuelve los extremos de marea de un día
- **THEN** están ordenados cronológicamente y alternan entre pleamar y bajamar

### Requirement: Presentación de las mareas del día
El detalle de un spot SHALL mostrar las horas de pleamar y bajamar del día seleccionado, cada una con su altura y etiquetada de forma que se distinga alta de baja.

#### Scenario: Mareas visibles en el detalle
- **WHEN** el usuario abre el detalle de un spot con datos de nivel del mar
- **THEN** ve las horas de pleamar y bajamar del día seleccionado, etiquetadas y con su altura

#### Scenario: Sin datos de marea
- **WHEN** no hay serie de nivel del mar disponible para el spot
- **THEN** la sección de mareas indica que no hay datos disponibles, sin mostrar horas inventadas

### Requirement: Las mareas siguen al día seleccionado
Las mareas mostradas SHALL corresponder al día del instante seleccionado en la línea temporal, no siempre al día actual.

#### Scenario: Cambio de día
- **WHEN** el usuario desplaza la línea temporal hasta una hora del día siguiente
- **THEN** las mareas mostradas son las de ese día siguiente
