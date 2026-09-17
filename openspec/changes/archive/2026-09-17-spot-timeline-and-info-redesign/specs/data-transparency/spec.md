## ADDED Requirements

### Requirement: Panel fácil de leer
El panel SHALL presentar cada sección como una tarjeta con título e icono, SHALL abrir con la leyenda de condiciones en una tarjeta destacada y SHALL ofrecer accesos rápidos que lleven a cada sección sin perder el contenido de las demás.

#### Scenario: Leyenda primero
- **WHEN** el usuario abre el panel
- **THEN** lo primero que ve es la tarjeta de condiciones con cada nivel, su marcador y su rango de nota

#### Scenario: Acceso rápido
- **WHEN** el usuario pulsa el acceso rápido de la puntuación
- **THEN** el panel se desplaza hasta la sección de cómo funciona la puntuación
