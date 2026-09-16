## Purpose

Determina qué spots ve el surfista en cada momento: el país y la región en foco, cómo se eligen solos a partir de su ubicación y cómo responde el mapa cuando cambian.

## ADDED Requirements

### Requirement: No existe una vista de todas las regiones
El selector NO SHALL ofrecer una opción que muestre todas las regiones a la vez. En todo momento hay exactamente un país y una región seleccionados.

#### Scenario: El desplegable solo contiene regiones reales
- **WHEN** el usuario abre el selector de región
- **THEN** todas las opciones son regiones del catálogo y ninguna representa "todas"

### Requirement: Región derivada de la geolocalización
Cuando el navegador entregue la ubicación del usuario, el sistema SHALL seleccionar el país y la región del spot más cercano a esa ubicación.

#### Scenario: Usuario en la costa
- **WHEN** la geolocalización sitúa al usuario a menos de 250 km de un spot del catálogo
- **THEN** se seleccionan el país y la región de ese spot

#### Scenario: Usuario lejos de cualquier costa
- **WHEN** la geolocalización sitúa al usuario a más de 250 km de todo spot del catálogo
- **THEN** se seleccionan el país y la región por defecto

### Requirement: Región por defecto sin geolocalización
Si el usuario deniega la geolocalización o no está disponible, el sistema SHALL seleccionar Cataluña. Si el catálogo no contuviera esa región, SHALL degradar a la primera región disponible del país por defecto, nunca a un valor inexistente.

#### Scenario: Geolocalización denegada
- **WHEN** el usuario deniega el permiso de ubicación
- **THEN** la región seleccionada es la región por defecto y el mapa muestra sus spots

#### Scenario: La región por defecto siempre existe
- **WHEN** se valida el catálogo publicado
- **THEN** la región por defecto figura entre las regiones del país por defecto

### Requirement: La elección manual prevalece
Una selección manual de país o región NO SHALL ser sobrescrita por una respuesta tardía de la geolocalización.

#### Scenario: Geolocalización tardía
- **WHEN** el usuario elige una región a mano y después llega la respuesta de geolocalización
- **THEN** la región elegida a mano se mantiene

### Requirement: El mapa sigue a la región seleccionada
Al cambiar de país o de región, el mapa SHALL encuadrar la extensión de los spots de la región seleccionada.

#### Scenario: Cambio de región
- **WHEN** el usuario cambia la región
- **THEN** el mapa se desplaza hasta encuadrar los spots de la región nueva

#### Scenario: Cambio de país
- **WHEN** el usuario cambia el país
- **THEN** se selecciona una región de ese país y el mapa se desplaza hasta ella

### Requirement: El forecast se pide solo de lo visible
El sistema NO SHALL solicitar el forecast de todos los spots de una región al cargarla. SHALL dibujar todos los marcadores de inmediato sin puntuación y SHALL puntuar únicamente los spots dentro del área visible del mapa, con un número acotado de peticiones simultáneas.

#### Scenario: Región extensa
- **WHEN** se selecciona una región con centenares de spots
- **THEN** todos sus marcadores aparecen de inmediato sin puntuación y solo se puntúan los visibles

#### Scenario: Desplazamiento del mapa
- **WHEN** el usuario desplaza o amplía el mapa y entran spots sin puntuar
- **THEN** esos spots se puntúan y sus marcadores se actualizan
