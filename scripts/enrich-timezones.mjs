import {readFile,writeFile} from 'node:fs/promises';
import {find} from 'geo-tz/all';

// Resolve exact timezone polygons offline; the browser only receives IANA names.
const path=new URL('../public/data/airports.json',import.meta.url);
const airports=JSON.parse(await readFile(path,'utf8'));
const ambiguous=[];
for(const airport of airports){
 const zones=find(airport.lat,airport.lon);
 // Chinese civil aviation uses Beijing time, including Xinjiang.
 // CAAC AIP GEN 2.1: https://yinlei.org/x-plane10/doc/GEN.pdf
 const timezone=airport.country==='CN'&&zones.includes('Asia/Shanghai')?'Asia/Shanghai':zones.length===1?zones[0]:null;
 airport.timezone=timezone;
 if(!timezone)ambiguous.push({id:airport.id,zones});
}
await writeFile(path,JSON.stringify(airports));
console.log(JSON.stringify({airports:airports.length,resolved:airports.length-ambiguous.length,ambiguous},null,2));
