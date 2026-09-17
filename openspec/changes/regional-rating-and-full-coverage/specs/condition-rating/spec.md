## MODIFIED Requirements

### Requirement: Leyenda de la escala
La interfaz SHALL mostrar una leyenda que explique qué representa cada nivel de la escala y su rango de puntuación. La leyenda SHALL mostrarse como primera sección del panel de información y NO SHALL ocupar espacio permanente sobre el mapa.

#### Scenario: Leyenda visible
- **WHEN** el usuario abre el panel de información
- **THEN** lo primero que ve es la leyenda con los niveles de calidad y el aviso de peligro

#### Scenario: Mapa despejado
- **WHEN** el usuario abre la aplicación en un móvil
- **THEN** no hay leyenda superpuesta al mapa
