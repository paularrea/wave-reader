# Evidencia del PRD rating-trust (21-09-2026)

Scripts de investigación, no de producción. Reflejan el motor en el momento de la investigación: `measure.ts` conserva la regla de rachas antigua, pero importa el motor actual, así que volver a ejecutarlo mezcla las dos versiones. Para medir el motor actual, usa `npm run test:measure`. R7 del PRD los convierte en una herramienta versionada.

- `sweep.ts`: barrido del motor con entradas casi idénticas (Etapa 1).
- `measure.ts`: descarga el horizonte de 5 regiones (18 llamadas a Open-Meteo, cacheadas en `.cache/rating-trust/`) y guarda los factores por hora en `rows.json`.
- `analyze.py rows.json`: saltos entre horas y entre spots visualmente idénticos, con su causa (Etapa 2).
- `options.py rows.json`: simula las alternativas A–F frente a la línea base (Etapa 4).

```bash
node_modules/.bin/jiti openspec/proposals/rating-trust-evidence/measure.ts
python3 openspec/proposals/rating-trust-evidence/options.py .cache/rating-trust/rows.json
```
