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

### Requirement: El catálogo contiene spots de surf, no toda playa etiquetada
El catálogo publicado SHALL excluir los lugares donde no rompe una ola
surfeable y SHALL contener, como mucho, un spot por tramo de costa que comparta
previsión. Un lugar cuyo nombre lo identifique como puerto, dársena, muelle,
club náutico, embarcadero, dique, piscina o agua interior NO SHALL incluirse.

#### Scenario: Puerto descartado
- **WHEN** el generador encuentra un lugar cuyo nombre lo identifica como puerto o dársena
- **THEN** el lugar no entra en el catálogo y queda registrado con ese motivo

#### Scenario: Dos playas en la misma celda del modelo
- **WHEN** dos lugares del catálogo candidato distan menos que la resolución del modelo marino
- **THEN** sólo uno de los dos entra en el catálogo, y el descartado queda registrado

#### Scenario: Exposición insuficiente
- **WHEN** el arco de mar abierto de un lugar no alcanza los 120 grados
- **THEN** el lugar no entra en el catálogo salvo que figure en la lista curada de breaks conocidos

### Requirement: Los breaks conocidos sobreviven al filtro
Los spots reconocidos de cada región SHALL figurar en el catálogo publicado y
SHALL representar a su tramo de costa frente a playas vecinas sin nombre de
surf.

#### Scenario: Break conocido frente a playa vecina
- **WHEN** un break de la lista curada comparte tramo con otra playa
- **THEN** el que entra en el catálogo es el de la lista curada

### Requirement: El catálogo se publica por país
Los datos del catálogo SHALL publicarse en un fichero por país más un índice
ligero por país, y el cliente NO SHALL descargar los spots de países que no
está mirando.

#### Scenario: Índice del país en foco
- **WHEN** el surfista mira una región de España
- **THEN** el cliente ha cargado el índice de España y ningún otro
