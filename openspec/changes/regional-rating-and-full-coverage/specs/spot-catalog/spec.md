## ADDED Requirements

### Requirement: Solo spots con datos de oleaje
El catálogo SHALL incluir únicamente spots para los que el modelo de oleaje devuelve datos en sus coordenadas. Los descartados SHALL registrarse con su motivo.

#### Scenario: Spot sin cobertura del modelo
- **WHEN** el modelo de oleaje no devuelve altura de ola para las coordenadas de un spot
- **THEN** el spot no entra en el catálogo y queda registrado como descartado por falta de datos

### Requirement: Descarga completa verificada
La descarga de cada región SHALL compararse con un recuento independiente del proveedor antes de aceptarse, y SHALL repetirse si llegan menos elementos de los contados.

#### Scenario: Respuesta truncada sin aviso
- **WHEN** el proveedor devuelve una respuesta bien formada con menos elementos de los que cuenta
- **THEN** la región se vuelve a descargar hasta completarse o se marca como fallida

### Requirement: Cobertura de Francia y Reino Unido
El catálogo SHALL incluir las regiones costeras de Francia, incluidas las de ultramar, y del Reino Unido. Inglaterra SHALL dividirse por condados ceremoniales.

#### Scenario: Países disponibles
- **WHEN** se lista el catálogo por país
- **THEN** aparecen España, Irlanda, Francia y Reino Unido

#### Scenario: Inglaterra por condados
- **WHEN** se listan las regiones del Reino Unido
- **THEN** incluyen condados ingleses como Cornwall y Devon, no una única región Inglaterra
