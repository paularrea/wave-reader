# marine-data Specification

## Purpose
Define de qué origen sale cada magnitud del forecast, en qué unidades se expone al resto del sistema y cómo se comportan los valores ausentes, para que la interfaz nunca presente un dato inventado como si fuera una medición.

## Requirements

### Requirement: El viento procede del endpoint meteorológico
La velocidad y dirección del viento SHALL obtenerse del endpoint de previsión meteorológica de Open-Meteo, no del endpoint marino. El endpoint marino NO SHALL usarse como origen de viento porque no sirve esa magnitud.

#### Scenario: Viento disponible
- **WHEN** se solicita el forecast de un spot y el endpoint meteorológico responde
- **THEN** la respuesta expone velocidad de viento en km/h y dirección en grados, ambas procedentes de ese endpoint

### Requirement: Velocidad de viento en km/h sin reescalado
La velocidad de viento SHALL exponerse en km/h tal y como la entrega el proveedor. NO SHALL aplicarse ningún factor de conversión adicional sobre el valor recibido.

#### Scenario: El valor del proveedor se preserva
- **WHEN** el proveedor devuelve una velocidad de viento de 18 km/h
- **THEN** el sistema expone 18 km/h, sin multiplicarlo por ningún factor

### Requirement: Los datos ausentes se distinguen del valor cero
Cuando una magnitud del forecast no esté disponible, el sistema SHALL exponerla como ausente y la interfaz SHALL indicar que no hay dato. Una magnitud ausente NO SHALL presentarse como 0 ni derivar en una clasificación de condiciones.

#### Scenario: Viento ausente no se muestra como cero
- **WHEN** el proveedor no devuelve velocidad de viento para la hora consultada
- **THEN** la interfaz muestra un indicador de dato no disponible y no muestra `0 km/h`

#### Scenario: Viento ausente no produce badge
- **WHEN** la velocidad de viento no está disponible
- **THEN** no se muestra ningún badge de condición de viento, en particular no el de `Glass`

### Requirement: Magnitudes expuestas
El forecast de un spot SHALL exponer altura, periodo y dirección del swell primario; velocidad y dirección del viento; y, cuando estén disponibles, swell secundario y olas de viento con su altura, periodo y dirección.

#### Scenario: Detalle completo disponible
- **WHEN** el usuario abre el detalle de un spot con forecast completo
- **THEN** ve altura, periodo y dirección del swell primario, y fuerza y dirección del viento

#### Scenario: Información ampliada
- **WHEN** el usuario consulta la información ampliada de un spot y hay swell secundario disponible
- **THEN** ve la altura, el periodo y la dirección del swell secundario y de las olas de viento
