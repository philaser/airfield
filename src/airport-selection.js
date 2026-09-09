export const LAST_AIRPORT_KEY='airfield-last-airport';

function findAirport(airports,value){
 const requested=String(value||'').trim().toUpperCase();
 return requested?airports.find(airport=>airport.id.toUpperCase()===requested||airport.code.toUpperCase()===requested):undefined;
}

export function readRememberedAirport(storage){
 try{return (storage===undefined?globalThis.localStorage:storage)?.getItem(LAST_AIRPORT_KEY)||null;}catch{return null;}
}

export function rememberAirport(airport,storage){
 try{(storage===undefined?globalThis.localStorage:storage)?.setItem(LAST_AIRPORT_KEY,airport.id);}catch{}
}

export function resolveAirportSelection(airports,search='',storage,fallback=airports[0]){
 const requested=new URLSearchParams(search).get('airport');
 return findAirport(airports,requested)||findAirport(airports,readRememberedAirport(storage))||findAirport(airports,fallback?.id)||fallback;
}
