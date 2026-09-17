# spot-catalog Specification

## Purpose
Garantiza que cada spot del catálogo corresponde a un lugar real de la costa, con coordenadas trazables a una fuente externa, de modo que el forecast que se muestra pertenece de verdad a ese punto y la navegación lleva al surfista al sitio correcto.

## Requirements

### Requirement: Coordenadas trazables a una fuente externa
Cada spot del catálogo SHALL tener coordenadas obtenidas de una fuente geográfica externa identificable, y SHALL registrar la procedencia de esa coordenada. Un spot cuyas coordenadas no se puedan verificar contra la fuente NO SHALL incluirse en el catálogo.

#### Scenario: Spot verificado se incluye
- **WHEN** el proceso de generación del catálogo resuelve el nombre de un spot contra la fuente externa y obtiene una coincidencia de tipo costero
- **THEN** el spot se incluye con las coordenadas de la fuente y un campo de procedencia que identifica la fuente y el identificador del registro

#### Scenario: Spot no verificable se descarta
- **WHEN** el proceso de generación no encuentra coincidencia para un spot, o la coincidencia no es de tipo costero
- **THEN** el spot se excluye del catálogo y queda registrado como descartado con el motivo

### Requirement: Cada spot cae en la costa
Cada spot del catálogo SHALL situarse en la franja costera: su elevación SHALL ser inferior a 100 metros y SHALL existir tierra firme a menos de 300 metros del punto. Ningún spot SHALL situarse en mar abierto ni tierra adentro.

Una elevación de 0 metros NO SHALL bastar por sí sola para rechazar un punto: el nodo de una playa suele caer justo en la línea de agua y marca 0, valor indistinguible del mar abierto si solo se mira el punto. Lo que separa ambos casos es el entorno.

#### Scenario: Coordenada en mar abierto es rechazada
- **WHEN** ninguna muestra de elevación a 300 metros alrededor de una coordenada candidata supera los 0 metros
- **THEN** la coordenada se rechaza por estar en mar abierto y el spot no entra en el catálogo

#### Scenario: Coordenada en la línea de agua es aceptada
- **WHEN** una coordenada candidata marca 0 metros pero alguna muestra a 300 metros alrededor supera los 0 metros
- **THEN** la coordenada se acepta por estar en la orilla

#### Scenario: Coordenada tierra adentro es rechazada
- **WHEN** la elevación de una coordenada candidata es 100 metros o mayor
- **THEN** la coordenada se rechaza por estar tierra adentro y el spot no entra en el catálogo

### Requirement: El match corresponde al spot pedido
El nombre del spot SHALL aparecer en el lugar devuelto por la fuente externa. Un resultado que sea una playa distinta NO SHALL aceptarse aunque cumpla tipo, comunidad y elevación.

#### Scenario: Playa vecina es rechazada
- **WHEN** la fuente devuelve una playa real de la misma comunidad cuyo nombre no contiene el nombre del spot
- **THEN** el candidato se descarta y se prueba el siguiente

#### Scenario: Nombre en otra lengua es aceptado
- **WHEN** la fuente nombra el lugar en otra lengua cooficial pero el nombre del spot aparece en su dirección
- **THEN** el candidato se acepta

### Requirement: Sin coordenadas duplicadas
Dos spots distintos NO SHALL compartir la misma coordenada. La precisión almacenada SHALL ser de al menos 4 decimales.

#### Scenario: Catálogo sin duplicados
- **WHEN** se valida el catálogo publicado
- **THEN** el número de coordenadas únicas es igual al número de spots

#### Scenario: Precisión suficiente
- **WHEN** se valida cualquier spot del catálogo
- **THEN** su latitud y longitud tienen al menos 4 decimales significativos

### Requirement: El catálogo se valida automáticamente
El proyecto SHALL incluir una comprobación automatizada que falle si el catálogo publicado infringe cualquiera de los requisitos anteriores.

#### Scenario: La validación bloquea un catálogo inválido
- **WHEN** se ejecuta la suite de tests con un catálogo que contiene un duplicado o una coordenada fuera de la franja costera
- **THEN** la suite falla e identifica el spot infractor
