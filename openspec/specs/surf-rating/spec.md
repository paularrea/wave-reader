# surf-rating Specification

## Purpose
Define cómo se calcula la puntuación de 0 a 10 que resume la calidad del surf en un spot y una hora, de forma que refleje si hay olas surfeables y cómo de buenas son, con independencia del nivel de quien consulta.

## Requirements

### Requirement: La puntuación mide el surf, no el nivel del surfista
La puntuación SHALL ser la misma para cualquier nivel de surfista ante las mismas condiciones. El nivel NO SHALL alterar la puntuación.

#### Scenario: Mismo mar, distinto nivel
- **WHEN** se puntúan las mismas condiciones para principiante, intermedio y experto
- **THEN** las tres puntuaciones son idénticas

### Requirement: La energía del oleaje es la base de la puntuación
La puntuación SHALL derivarse de la energía del oleaje, proporcional al cuadrado de la altura por el cuadrado del periodo, sumada sobre todas las componentes disponibles: swell primario, swell secundario y olas de viento. La energía SHALL expresarse en kJ en la misma escala que surf-forecast, y a igual periodo más altura SHALL puntuar más, y a igual altura más periodo SHALL puntuar más.

#### Scenario: Energía calibrada
- **WHEN** se calcula la energía de 2,5 m a 14 s
- **THEN** el resultado está a menos de un 10% de 2.323 kJ, el valor que publica surf-forecast

#### Scenario: El periodo importa
- **WHEN** se comparan 1,5 m a 12 s y 1,5 m a 7 s con el mismo viento y dirección
- **THEN** 1,5 m a 12 s puntúa más

#### Scenario: Componentes sumadas
- **WHEN** además del swell primario hay swell secundario u olas de viento
- **THEN** la energía total incluye la de cada componente

### Requirement: El mar plano puntúa cero
Cuando la energía total no alcance el umbral de mar surfeable, la puntuación SHALL ser 0 con independencia del viento.

#### Scenario: Mar de viento diminuto
- **WHEN** hay 0,3 m a 3 s con viento offshore ligero
- **THEN** la puntuación es 0

#### Scenario: Plancha sin olas
- **WHEN** hay 0,2 m a 4 s y viento en calma
- **THEN** la puntuación es 0

### Requirement: El periodo corto penaliza la calidad
Además de su menor energía, un periodo corto SHALL reducir la puntuación, porque produce olas desordenadas. A igual energía, el periodo más corto SHALL puntuar menos.

#### Scenario: Igual energía, distinto periodo
- **WHEN** se comparan 3 m a 6 s y 1,5 m a 12 s, que suman prácticamente la misma energía
- **THEN** 1,5 m a 12 s puntúa más

### Requirement: La dirección del swell respecto al spot
La energía procedente de dentro de la ventana de swell del spot SHALL contar íntegra. La que llegue de fuera SHALL atenuarse progresivamente según se aleja de la ventana, sin anularse del todo, porque el oleaje refracta.

#### Scenario: Swell fuera de la ventana
- **WHEN** el mismo swell llega de frente al spot y desde 90° fuera de su ventana
- **THEN** el que llega de frente puntúa más, y el de fuera no puntúa más de un tercio de aquel

### Requirement: El viento degrada la puntuación
El viento SHALL restar puntuación en proporción a su componente onshore y a su fuerza. El viento ligero o offshore moderado NO SHALL restar. El viento muy fuerte SHALL anular la puntuación en cualquier dirección.

#### Scenario: Onshore moderado
- **WHEN** a un mar que puntúa alto se le aplica viento onshore de 25 km/h
- **THEN** la puntuación cae al menos a la mitad

#### Scenario: Offshore ligero
- **WHEN** el viento es offshore de 15 km/h
- **THEN** la puntuación es igual a la potencial

#### Scenario: Temporal
- **WHEN** el viento supera los 75 km/h en cualquier dirección
- **THEN** la puntuación es 0

#### Scenario: Viento desconocido
- **WHEN** no hay dato de viento
- **THEN** la puntuación es igual a la potencial

### Requirement: Puntuación potencial
El sistema SHALL exponer, junto a la puntuación, la puntuación potencial que tendría el mar sin el efecto del viento, y la energía total en kJ. La puntuación nunca SHALL superar la potencial.

#### Scenario: Viento que estropea el mar
- **WHEN** un buen swell coincide con viento onshore
- **THEN** la puntuación potencial es mayor que la puntuación y el detalle muestra la diferencia

### Requirement: Sin datos no hay puntuación
Cuando no haya altura de ninguna componente del oleaje, el sistema SHALL marcar la hora como sin puntuar en lugar de devolver 0.

#### Scenario: Sin datos de oleaje
- **WHEN** todas las alturas de oleaje son nulas
- **THEN** el resultado se marca como sin puntuar
