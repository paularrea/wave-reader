# data-transparency Specification

## Purpose
Permite al surfista entender y juzgar la fiabilidad del parte: de qué modelos salen los datos, cuándo se actualizaron, cuándo se actualizarán y cómo se calcula la nota que ve en el mapa.

## Requirements

### Requirement: Acceso a la información desde cualquier pantalla
La interfaz SHALL mostrar un botón de información pequeño y siempre visible que abra un panel con la información de datos y puntuación, y que se pueda cerrar sin perder el estado del mapa.

#### Scenario: Abrir y cerrar
- **WHEN** el usuario pulsa el botón de información y después cierra el panel
- **THEN** el panel se abre con la información y al cerrarlo el mapa conserva la región y la hora seleccionadas

#### Scenario: En móvil
- **WHEN** se abre el panel en una pantalla de móvil
- **THEN** el panel cabe en la pantalla y su contenido se puede desplazar

### Requirement: Fuentes de datos y modelos
El panel SHALL indicar el proveedor de datos y, para cada modelo mostrado, qué magnitudes aporta, su resolución y su intervalo de actualización. SHALL aclarar que el proveedor elige automáticamente el modelo de mayor resolución disponible para cada punto.

#### Scenario: Modelos listados
- **WHEN** el usuario abre el panel
- **THEN** ve los modelos de oleaje y de viento con su resolución e intervalo de actualización

### Requirement: Estado de actualización real
Para cada modelo, el panel SHALL mostrar cuándo terminó su última ejecución y cuánto falta para la siguiente actualización esperada, calculados a partir de los metadatos que publica el proveedor, y SHALL actualizar la cuenta atrás mientras el panel está abierto. Si la siguiente actualización ya debería haber llegado, SHALL indicarlo en lugar de mostrar un tiempo negativo. Si los metadatos no están disponibles, SHALL decirlo sin inventar horas.

#### Scenario: Cuenta atrás
- **WHEN** faltan 2 horas y 5 minutos para la siguiente actualización esperada de un modelo
- **THEN** el panel lo muestra como tiempo restante

#### Scenario: Actualización con retraso
- **WHEN** la hora esperada de la siguiente actualización ya ha pasado
- **THEN** el panel indica que la actualización está pendiente

#### Scenario: Metadatos no disponibles
- **WHEN** el proveedor no responde a la consulta de metadatos
- **THEN** el panel indica que el estado de actualización no está disponible

### Requirement: Frecuencia de refresco de la aplicación
El panel SHALL indicar durante cuánto tiempo la aplicación reutiliza los datos ya obtenidos antes de pedirlos de nuevo.

#### Scenario: Caché explicada
- **WHEN** el usuario abre el panel
- **THEN** ve durante cuánto tiempo se reutilizan los datos de cada spot

### Requirement: Lógica de la puntuación
El panel SHALL explicar en lenguaje llano qué entra en la nota, que la escala está calibrada contra surf-forecast y con qué precisión, qué significan los niveles del mapa y cuándo salta el aviso de seguridad.

#### Scenario: Calibración visible
- **WHEN** el usuario lee la sección de puntuación
- **THEN** ve la referencia de calibración y el error medio validado

### Requirement: Limitaciones y próximas mejoras
El panel SHALL enumerar las limitaciones conocidas de los datos y de la nota, y SHALL anunciar la comparación entre modelos como mejora prevista.

#### Scenario: Limitaciones
- **WHEN** el usuario lee el panel
- **THEN** encuentra la advertencia sobre la precisión de mareas en costa y que la nota no considera marea ni tipo de fondo
