# Diseño

## La deduplicación era la herramienta equivocada para el trabajo correcto

El problema real que resolvía sigue existiendo: OpenStreetMap etiqueta cada
fragmento de playa, y sin filtro el mapa es ruido. Lo que estaba mal era el
alcance.

| | Antes | Ahora |
|---|---|---|
| Break curado | se deduplicaba | **siempre se publica** |
| Playa sin nombre de break | se deduplicaba | se deduplica |
| Mismo sitio mapeado dos veces | sobrevivía si distaba > 5 km | se detecta por nombre |

La deduplicación deja de ser una regla sobre la geografía y pasa a ser lo que
siempre debió ser: **un filtro de ruido para lo que nadie ha nombrado**.

## Por qué las coordenadas siguen saliendo de OSM

Se comprobó si OpenStreetMap etiqueta los picos: en Nouvelle-Aquitaine hay 120
elementos con `sport=surfing` y **todos son escuelas y tiendas**, ni un solo
pico. Pero los picos sí están como playas con su nombre real —"Plage de la
Gravière", "Plage du Santocha", "Plage de la Piste", "Plages des Cavaliers",
"Lafitenia", "Parlementia", "Maiarko"—, así que la lista curada sigue sin
llevar coordenadas: sólo dice cuál de los lugares catalogados es un pico.

Escribir el nombre como lo escribe OSM hace que el emparejamiento sea exacto en
vez de esperanzado, y es lo que recomienda ahora el propio fichero.

## Los dos fallos del emparejamiento

1. **Contención en ambos sentidos.** `curado.includes(lugar)` permitía que un
   fragmento genérico reclamara la identidad de un break: "Plage du Nord" se
   emparejaba con "La Cantine Nord" y "La plage Blanche" con "La Lette
   Blanche". El fragmento quedaba exento de deduplicación y además ocupaba el
   rango editorial del break real. Ahora sólo cuenta `lugar.includes(curado)`,
   con el nombre curado de 5 caracteres o más.

2. **La raíz del genitivo, demasiado suelta.** La regla existe para que
   "Zarautz" case con "Zarauzko hondartza" y "Deba" con "Debako Santiago
   hondartza". Con sólo cinco caracteres de prefijo común, "centrale" casaba
   con el "centre" de "Plage naturiste du centre de vacances d'Arnaoutchot".
   Ahora el nombre del lugar no puede tener más de un token de más respecto al
   curado, de modo que la raíz sirve para flexionar un nombre, no para
   encontrarlo enterrado en otro.

## Lo que esto no arregla

Sólo Nouvelle-Aquitaine tiene la lista reescrita contra los nombres reales de
OSM. El resto de regiones conserva la lista anterior, escrita de memoria, y sus
fallos de emparejamiento quedan en `curatedNamesWithoutMatch` del informe: 235
nombres curados sin correspondencia. Cada región que se revise reduce ese
número. Los breaks que OSM no mapea en absoluto —Mundaka, Famara, Hossegor,
Lahinch— seguirán ausentes hasta que el catálogo acepte coordenadas propias.
