# responsive-layout Specification

## Purpose
Garantiza que la aplicación quepa en la pantalla del dispositivo, que es donde se consulta un parte de mar: de pie, en el coche, antes de entrar al agua.

## Requirements

### Requirement: La página ocupa el viewport sin desbordar
La página NO SHALL desplazarse ni vertical ni horizontalmente en ninguna resolución soportada. La altura SHALL calcularse sobre la altura visible real del navegador, no sobre la nominal.

#### Scenario: Pantalla de móvil
- **WHEN** la aplicación se abre en una pantalla de 390x844
- **THEN** la página no presenta scroll vertical ni horizontal

#### Scenario: Controles alcanzables
- **WHEN** la aplicación se abre en una pantalla de móvil
- **THEN** el selector de región y la barra temporal quedan dentro del área visible

### Requirement: El detalle respeta el área segura
El detalle de un spot SHALL caber en la pantalla y SHALL respetar el área segura inferior del dispositivo.

#### Scenario: Detalle en móvil
- **WHEN** el usuario abre el detalle en una pantalla de móvil
- **THEN** la puntuación y la acción principal quedan ambas dentro del área visible
