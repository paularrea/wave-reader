## ADDED Requirements

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
