# Los breaks con nombre no se deduplican

## Why

El filtro de catálogo aplicaba la deduplicación por celda del modelo (5 km) a
**todos** los spots, incluidos los breaks reconocidos. En una costa de beach
breaks eso es destructivo:

- Los doce picos de Anglet caben en cuatro kilómetros. Quedó **uno**.
- En las Landes desaparecieron La Gravière, Le Santocha, La Piste, Les
  Estagnots y Le Penon, que son los spots por los que la gente conduce.
- Nouvelle-Aquitaine publicaba 51 spots donde surf-forecast lista más de 100
  entre Côte Basque, Landes y Gironde.

El razonamiento de "misma celda, misma previsión" es cierto sobre el modelo y
falso sobre el producto: quien elige entre La Barre y Les Cavaliers elige entre
dos bancos y dos ambientes. **La identidad de un spot es editorial, no una
propiedad del modelo de oleaje.**

Además el emparejamiento de nombres tenía dos fallos que metían ruido y robaban
identidad a los breaks reales: la contención de nombres funcionaba en los dos
sentidos, de modo que "Plage du Nord" se hacía pasar por "La Cantine Nord"; y
la regla de raíz para el genitivo vasco daba por buena "centre" dentro de
"centrale", colando un cámping nudista como pico.

## What Changes

- La deduplicación por celda SHALL aplicarse **sólo a los lugares sin nombre de
  break**. Un break de la lista curada se publica siempre.
- Nueva regla contra el mismo sitio mapeado dos veces en OSM: mismo nombre a
  menos de 1,5 km es un lugar, no dos.
- La contención de nombres pasa a ser en un solo sentido, y la regla de raíz
  exige que el nombre curado cubra el del lugar, no que aparezca dentro de él.
- Playas de lago, laguna y étang fuera; secciones nudistas fuera aunque la
  playa esté curada.
- Lista curada de Nouvelle-Aquitaine reescrita con los nombres tal y como los
  escribe OpenStreetMap: Côte Basque, Landes y Gironde completas.

## Impact

- Specs: `spot-catalog`
- Código: `scripts/curate-spots.mjs`, `src/data/surf-spots.curated.json`
- Datos: el catálogo pasa de 1.417 a 1.690 spots; Nouvelle-Aquitaine de 51 a
  110, País Vasco de 15 a 31, Cataluña de 54 a 83.

## Non-goals

- No se reescriben todavía las listas curadas del resto de regiones. Las que no
  la tienen siguen con el filtro automático, y eso queda registrado.
