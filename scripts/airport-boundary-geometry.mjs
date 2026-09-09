const mapKinds=new Set(['runway','taxiway','terminal','apron','hangar','parking_position']);
const finitePoint=point=>Number.isFinite(point?.lat)&&Number.isFinite(point?.lon);
const samePoint=(a,b)=>a.lat===b.lat&&a.lon===b.lon;

function closedWay(element){
 const geometry=element.geometry;
 return Array.isArray(geometry)&&geometry.length>=4&&geometry.every(finitePoint)&&samePoint(geometry[0],geometry.at(-1))?geometry:null;
}

function stitchRings(segments){
 const remaining=segments.map(member=>[...member.geometry]),rings=[];
 while(remaining.length){
  const ring=remaining.shift();
  while(!samePoint(ring[0],ring.at(-1))){
   const end=ring.at(-1);
   const candidates=remaining.map((segment,index)=>({segment,index})).filter(({segment})=>samePoint(segment[0],end)||samePoint(segment.at(-1),end));
   if(candidates.length!==1)return null;
   const [segment]=remaining.splice(candidates[0].index,1);
   if(samePoint(segment.at(-1),end))segment.reverse();
   ring.push(...segment.slice(1));
  }
  if(ring.length<4)return null;
  rings.push(ring);
 }
 return rings;
}

function relationOuterRing(element){
 const members=element.members||[];
 if(!members.length||members.some(member=>member.type!=='way'||!['outer','inner'].includes(member.role)||!Array.isArray(member.geometry)||member.geometry.length<2||!member.geometry.every(finitePoint)))return null;
 const outers=stitchRings(members.filter(member=>member.role==='outer'));
 const holes=stitchRings(members.filter(member=>member.role==='inner'));
 return outers?.length&&holes?{outers,holes}:null;
}

function boundaryRing(element){
 if(element.type==='way'){const outer=closedWay(element);return outer?{outers:[outer],holes:[]}:null;}
 if(element.type==='relation')return relationOuterRing(element);
 return null;
}

function onSegment(point,a,b){
 const cross=(point.lon-a.lon)*(b.lat-a.lat)-(point.lat-a.lat)*(b.lon-a.lon);
 if(Math.abs(cross)>1e-10)return false;
 return point.lon>=Math.min(a.lon,b.lon)-1e-10&&point.lon<=Math.max(a.lon,b.lon)+1e-10&&point.lat>=Math.min(a.lat,b.lat)-1e-10&&point.lat<=Math.max(a.lat,b.lat)+1e-10;
}

function insideOrOn(point,ring){
 if(!finitePoint(point))return false;
 let inside=false;
 for(let index=0,previous=ring.length-1;index<ring.length;previous=index++){
  const a=ring[previous],b=ring[index];
  if(onSegment(point,a,b))return true;
  if((a.lat>point.lat)!==(b.lat>point.lat)&&point.lon<(b.lon-a.lon)*(point.lat-a.lat)/(b.lat-a.lat)+a.lon)inside=!inside;
 }
 return inside;
}

function exactIdentity(element,airport){
 const icao=String(element.tags?.icao||'').trim().toUpperCase();
 const iata=String(element.tags?.iata||'').trim().toUpperCase();
 const expectedIcao=String(airport?.id||'').trim().toUpperCase();
 const expectedIata=String(airport?.code||'').trim().toUpperCase();
 return Boolean((expectedIcao&&icao===expectedIcao)||(expectedIata&&iata===expectedIata));
}

function normalizeBbox(value){
 if(!value)return undefined;
 const bbox=Array.isArray(value)?{south:value[0],west:value[1],north:value[2],east:value[3]}:value;
 return [bbox.south,bbox.west,bbox.north,bbox.east].every(Number.isFinite)&&bbox.south<bbox.north&&bbox.west<bbox.east?bbox:null;
}

function boundaryWithinBbox(ring,bbox){
 return ring.every(point=>point.lat>=bbox.south&&point.lat<=bbox.north&&point.lon>=bbox.west&&point.lon<=bbox.east);
}

/** Select airport features from a broad Overpass `nwr(bbox)[aeroway];out geom` response. */
export function selectAirportBoundaryGeometry(data,airport,options={}){
 if(!data||!Array.isArray(data.elements)||!airport||data.remark)return null;
 if(typeof options==='string')options={discoveryLabel:options};
 const bbox=normalizeBbox(options.bbox);
 if(options.bbox&& !bbox)return null;
 const matches=data.elements.filter(element=>element.tags?.aeroway==='aerodrome'&&exactIdentity(element,airport));
 if(matches.length!==1)return null;
 const boundary=boundaryRing(matches[0]);
 if(!boundary||(bbox&&!boundary.outers.every(ring=>boundaryWithinBbox(ring,bbox))))return null;
 const contains=point=>boundary.outers.some(ring=>insideOrOn(point,ring))&&!boundary.holes.some(ring=>insideOrOn(point,ring));
 const elements=[];
 for(const element of data.elements){
  if(element===matches[0]||element.type==='node'||!mapKinds.has(element.tags?.aeroway))continue;
  if(element.type==='way'){
   if(Array.isArray(element.geometry)&&element.geometry.length>=2&&element.geometry.every(finitePoint)&&element.geometry.some(contains))elements.push(element);
  }else if(element.type==='relation'){
   const members=element.members||[];
   const complete=member=>member.type==='way'&&Array.isArray(member.geometry)&&member.geometry.length>=2&&member.geometry.every(finitePoint);
   if(!members.some(member=>complete(member)&&member.geometry.some(contains)))continue;
   if(members.some(member=>!complete(member)))return null;
   elements.push(element);
  }
 }
 const discoveryLabel=options.discoveryLabel===undefined?'Verified airport boundary':options.discoveryLabel;
 return {...data,elements,...(discoveryLabel?{airfieldDiscovery:discoveryLabel}:{})};
}
