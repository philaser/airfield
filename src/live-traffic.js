import {aircraftTypes} from './aircraft-types.js';
import {aircraftProfiles} from './aircraft-profiles.js';
export function projectPosition(lat,lon,airport){return {x:((lon-airport.lon+540)%360-180)*111320*Math.cos(airport.lat*Math.PI/180),y:-(lat-airport.lat)*111320};}
function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy)||0));return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);}
function inside(p,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function nearAirport(p,features){
 const relevant=features.filter(f=>['runway','taxiway','apron','terminal','hangar','parking_position'].includes(f.tags.aeroway));
 if(!relevant.length)return Math.hypot(p.x,p.y)<2000;
 // Runway-only geometry omits aprons and stands. Use its airport vicinity envelope.
 if(!relevant.some(f=>f.tags.aeroway!=='runway')){
  const points=relevant.flatMap(f=>f.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return p.x>=Math.min(...xs)-750&&p.x<=Math.max(...xs)+750&&p.y>=Math.min(...ys)-750&&p.y<=Math.max(...ys)+750;
 }
 return relevant.some(f=>(f.closed&&inside(p,f.points))||f.points.slice(1).some((b,i)=>segmentDistance(p,f.points[i],b)<250));
}
const names={B77W:'Boeing 777-300ER',B772:'Boeing 777-200ER',B789:'Boeing 787-9',A35K:'Airbus A350-1000',A388:'Airbus A380-800',A320:'Airbus A320',A319:'Airbus A319'};
export function liveFlights(snapshot,airport,features){
 if(!snapshot)return [];
 const seen=new Set();
 return snapshot.ac.flatMap(a=>{
  if(!a.hex||seen.has(a.hex)||a.alt_baro!=='ground'||a.t==='TWR'||['C3','C4','C5'].includes(a.category)||!Number.isFinite(a.lat)||!Number.isFinite(a.lon)||Math.abs(a.lat)>90||Math.abs(a.lon)>180||!Number.isFinite(a.seen_pos)||a.seen_pos>60||a.seen_pos<0)return [];
  const position=projectPosition(a.lat,a.lon,airport);if(!nearAirport(position,features))return [];seen.add(a.hex);
  const vehicle=['C1','C2'].includes(a.category)||a.type==='adsb_icao_nt'||['GRND','GND'].includes(a.t);
  const model=a.t?.trim().toUpperCase()||null;const identity=aircraftTypes[model];const profile=aircraftProfiles[model];const kind=vehicle?'vehicle':profile?.kind==='helicopter'||identity?.[1]?.startsWith('H')||(!identity&&a.category==='A7')?'helicopter':'plane';
  const heading=[a.true_heading,a.track].find(Number.isFinite),speed=Number.isFinite(a.gs)&&a.gs>=0?a.gs:null;
  return [{id:a.hex,vehicle,kind,number:a.flight?.trim()||a.r||a.hex.toUpperCase(),registration:a.r||'Not reported',model,aircraft:vehicle?'Ground vehicle':profile?.name||names[model]||identity?.[0]||model||(kind==='helicopter'?'Helicopter · type not reported':'Type not reported'),position:{...position,angle:heading??0},headingKnown:heading!==undefined,speed,moving:speed!==null&&speed>1,status:speed===null?'On ground':speed>1?'Moving':'Stationary',observedAt:snapshot.sourceTime-a.seen_pos*1000,positionSource:a.type||'Not reported',lat:a.lat,lon:a.lon}];
 }).sort((a,b)=>Number(b.moving)-Number(a.moving)||a.number.localeCompare(b.number));
}
