/* eslint-disable @typescript-eslint/no-explicit-any -- research script kept as evidence, not product code */
import { calculateStarRating } from '../../../src/services/star-engine';
const cfg:any = { swellWindow:{minAngle:270,maxAngle:360}, offshoreWindAngle:135, windTolerance:0,
  idealHeight:{beginner:{min:.3,max:1},intermediate:{min:.5,max:2},expert:{min:1,max:4}} };
const base = { swellHeight:1.4, swellPeriod:10, swellDirection:315, secondarySwellHeight:null, secondarySwellPeriod:null,
  secondarySwellDirection:null, windWaveHeight:null, windWavePeriod:null, windWaveDirection:null,
  windSpeed:5, windGust:8, windDirection:135 } as any;
const r = (f:any)=>calculateStarRating({...base,...f}, cfg, 'intermediate','x','atlantic').stars;
console.log('== A. Periodo: 0.2 s de diferencia (limpio, 315°) ==');
for (const h of [1.0,1.4,1.8,2.2]) console.log(`  ${h} m  @9.9s → ${r({swellHeight:h,swellPeriod:9.9})}   @10.1s → ${r({swellHeight:h,swellPeriod:10.1})}`);
console.log('== B. Mismo swell 1.8 m @ 11 s; añado olas de viento pequeñas (UI muestra solo el swell) ==');
for (const [h,t] of [[0,0],[0.3,4],[0.5,4],[0.6,5]]) console.log(`  + wind waves ${h} m @${t}s → ${h? r({swellHeight:1.8,swellPeriod:11,windWaveHeight:h,windWavePeriod:t,windWaveDirection:315}) : r({swellHeight:1.8,swellPeriod:11})}`);
console.log('== C. Dirección cerca del borde de la ventana (270°) ==');
for (const d of [275,265,255,245]) console.log(`  1.4 m @12s desde ${d}° → ${r({swellPeriod:12,swellDirection:d})}`);
console.log('== D. Viento: onshore 12 vs 16 km/h (2.0 m @12s) ==');
for (const w of [7,10,12,16]) console.log(`  onshore ${w} km/h → ${r({swellHeight:2,swellPeriod:12,windSpeed:w,windGust:w*1.77,windDirection:315})}`);
