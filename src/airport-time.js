const formatters=new Map();
export function airportClock(airport,now=new Date()){
 if(!airport.timezone)return {time:'—',zone:null};
 try{
  if(!formatters.has(airport.timezone))formatters.set(airport.timezone,new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZoneName:'short',timeZone:airport.timezone}));
  const parts=formatters.get(airport.timezone).formatToParts(now);
  const part=type=>parts.find(p=>p.type===type)?.value;
  return {time:`${part('hour')}:${part('minute')}`,zone:part('timeZoneName')};
 }catch{return {time:'—',zone:null};}
}
