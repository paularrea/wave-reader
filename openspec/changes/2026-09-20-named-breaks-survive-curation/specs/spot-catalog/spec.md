## MODIFIED Requirements

### Requirement: El catálogo contiene spots de surf, no toda playa etiquetada
El catálogo publicado SHALL excluir los lugares donde no rompe una ola
surfeable. Un lugar cuyo nombre lo identifique como puerto, dársena, muelle,
club náutico, embarcadero, dique, piscina, lago, laguna o agua interior NO SHALL
incluirse, ni tampoco una sección de playa reservada a otro uso.

Entre los lugares que nadie ha nombrado como break, el catálogo SHALL publicar
como mucho uno por tramo de costa que comparta celda del modelo. Esta
deduplicación NO SHALL aplicarse a los breaks de la lista curada: la identidad
de un spot es editorial, no una propiedad del modelo de oleaje, y dos picos
separados por trescientos metros son dos spots aunque compartan previsión.

El mismo lugar mapeado dos veces en la fuente —igual nombre a menos de kilómetro
y medio— SHALL publicarse una sola vez.

#### Scenario: Puerto descartado
- **WHEN** el generador encuentra un lugar cuyo nombre lo identifica como puerto o dársena
- **THEN** el lugar no entra en el catálogo y queda registrado con ese motivo

#### Scenario: Dos playas en la misma celda del modelo
- **WHEN** dos lugares sin nombre de break distan menos que la resolución del modelo marino
- **THEN** sólo uno de los dos entra en el catálogo, y el descartado queda registrado

#### Scenario: Picos vecinos con nombre propio
- **WHEN** varios breaks de la lista curada comparten celda del modelo, como los de Anglet
- **THEN** todos entran en el catálogo

#### Scenario: El mismo sitio mapeado dos veces
- **WHEN** la fuente contiene dos entradas con el mismo nombre a menos de kilómetro y medio
- **THEN** sólo una entra en el catálogo

#### Scenario: Exposición insuficiente
- **WHEN** el arco de mar abierto de un lugar no alcanza los 120 grados
- **THEN** el lugar no entra en el catálogo salvo que figure en la lista curada de breaks conocidos

### Requirement: Los breaks conocidos sobreviven al filtro
Los spots reconocidos de cada región SHALL figurar en el catálogo publicado. Un
nombre curado SHALL emparejarse con un lugar sólo cuando el nombre del lugar
contenga al nombre curado, nunca al revés, de modo que un nombre genérico no
pueda apropiarse de la identidad de un break.

#### Scenario: Break conocido frente a playa vecina
- **WHEN** un break de la lista curada comparte tramo con otra playa sin nombre de break
- **THEN** el que entra en el catálogo es el de la lista curada

#### Scenario: Los picos de una playa larga
- **WHEN** se publica el catálogo de Nouvelle-Aquitaine
- **THEN** figuran Lafitenia, Parlementia, Plage de la Gravière, Plage du Santocha y Plage de la Piste

#### Scenario: Un nombre genérico no se hace pasar por un break
- **WHEN** la fuente contiene "Plage du Nord" y la lista curada contiene "La Cantine Nord"
- **THEN** "Plage du Nord" no se considera un break con nombre
