## MODIFIED Requirements

### Requirement: Escala de calidad legible de un vistazo
La calidad SHALL representarse en tres niveles claramente distinguibles: excelente (5 a 10), aceptable (1 a 4) y pobre (0). Los umbrales siguen la escala de surf-forecast, donde una estrella ya indica surf aprovechable y 5 o más solo aparece en días de calidad. Los niveles SHALL diferenciarse por más de un canal visual a la vez — color, tamaño y realce — y NO SHALL distinguirse únicamente por la opacidad de un mismo color, que resulta indistinguible sobre un mapa oscuro. NO SHALL usarse verde en ninguna superficie que represente calidad.

#### Scenario: Los tres niveles se distinguen por tamaño
- **WHEN** se comparan marcadores de un spot excelente, uno aceptable y uno pobre
- **THEN** el excelente se dibuja mayor que el aceptable y este mayor que el pobre, y los tres usan colores distintos

#### Scenario: Solo lo excelente destaca
- **WHEN** un spot puntúa 5 o más
- **THEN** su marcador lleva realce luminoso y muestra su puntuación; los de puntuación 0 no muestran puntuación

#### Scenario: Ausencia de verde
- **WHEN** se inspecciona cualquier marcador o indicador de calidad
- **THEN** ninguno usa un color verde

#### Scenario: Sin datos no es mala puntuación
- **WHEN** un spot no tiene forecast disponible
- **THEN** su marcador se dibuja hueco y se distingue de un spot con mala puntuación
