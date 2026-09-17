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

### Requirement: Racha de viento
El forecast SHALL exponer la racha de viento en km/h, procedente del endpoint meteorológico, con el mismo tratamiento de ausencia que el resto de magnitudes.

#### Scenario: Racha disponible
- **WHEN** el proveedor devuelve racha para la hora consultada
- **THEN** la respuesta la expone en km/h sin reescalar

#### Scenario: Racha ausente
- **WHEN** el proveedor no devuelve racha
- **THEN** la racha se expone como ausente y la puntuación usa solo el viento medio

### Requirement: Serie horaria completa por spot
El servicio SHALL ofrecer para un spot la previsión de cada hora del horizonte en una sola respuesta, con la puntuación, la puntuación sin viento, el aviso de seguridad para el nivel pedido y las mareas de cada día local. Oleaje y viento SHALL unirse por marca de tiempo.

#### Scenario: Siete días
- **WHEN** se pide la serie de un spot
- **THEN** la respuesta contiene una entrada por hora desde la hora de anclaje hasta 168 horas después, cada una con su puntuación

#### Scenario: Hora sin viento
- **WHEN** el proveedor de viento no tiene una hora que sí tiene el de oleaje
- **THEN** esa hora conserva el oleaje y el viento queda como ausente

### Requirement: Lotes del mapa con todo el horizonte
Cada lote de puntuación del mapa SHALL devolver, para cada spot, la nota, el tamaño y el periodo de cada hora del horizonte junto con la hora UTC del primer valor, de forma que cambiar de hora no requiera nuevas peticiones.

#### Scenario: Mover el slider
- **WHEN** los lotes visibles ya están cargados y el usuario cambia de hora
- **THEN** los marcadores se actualizan sin nuevas peticiones al servidor
