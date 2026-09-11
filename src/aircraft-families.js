import {aircraftTypes} from './aircraft-types.js';

const familyLabels={
 A320:'Airbus A320 family',A332:'Airbus A330 family',A359:'Airbus A350 family',A388:'Airbus A380',
 BCS3:'Airbus A220 family',B738:'Boeing 737 family',B744:'Boeing 747 family',B752:'Boeing 757 family',
 B763:'Boeing 767 family',B772:'Boeing 777 family',B789:'Boeing 787 family',
 E190:'Embraer E-Jet family',E75L:'Embraer E175 family',CRJ7:'Bombardier CRJ family',
 DH8D:'De Havilland Dash 8 family',AT76:'ATR family',
 'jet-small':'Small business jet','jet-large':'Large business jet','jet-airliner':'Passenger jet','jet-heavy':'Heavy jet',
 'prop-single':'Single-engine propeller aircraft','prop-single-large':'Single-engine turboprop',
 'prop-twin':'Multi-engine propeller aircraft',turboprop:'Twin-engine turboprop','prop-heavy':'Heavy turboprop',helicopter:'Helicopter',
 fighter:'Fighter aircraft',glider:'Glider',balloon:'Balloon',unknown:'Unknown aircraft',
};

const familyCodes={
 A320:['A318','A319','A320','A321','A19N','A20N','A21N'],
 A332:['A332','A333','A337','A338','A339'],
 A359:['A359','A35K'],
 A388:['A388'],
 BCS3:['BCS1','BCS3'],
 B738:['B732','B733','B734','B735','B736','B737','B738','B739','B37M','B38M','B39M','B3XM','E737','P8'],
 B744:['B741','B742','B743','B744','B748','B74R','B74S','BLCF'],
 B752:['B752','B753'],
 B763:['B762','B763','B764'],
 B772:['B772','B773','B778','B779','B77L','B77W'],
 B789:['B788','B789','B78X'],
 E75L:['E170','E75L','E75S'],
 E190:['E190','E195','E275','E290','E295'],
 CRJ7:['CRJ1','CRJ2','CRJ7','CRJ9','CRJX'],
 DH8D:['DH8A','DH8B','DH8C','DH8D'],
 AT76:['AT43','AT44','AT45','AT46','AT72','AT73','AT75','AT76'],
};

const codeFamilies=new Map(Object.entries(familyCodes).flatMap(([family,codes])=>codes.map(code=>[code,family])));

// These designators unambiguously identify fighter airframes. Other military
// aircraft still receive a safe size/configuration fallback from the ICAO data.
const fighterCodes=new Set(['EUFI','F14','F15','F16','F16X','F18H','F18S','F22','F35','J10','J20','JAS3','MG29','RFAL','SU27','T38','VF35']);

const smallBusinessJetCodes=new Set(['C25A','C25B','C25C','C25M','C500','C501','C510','C525','C526','C550','C551','C55B','C560','C56X','C650']);

const commercialJetPattern=/^(?:AIRBUS A-|ANTONOV An-(?:72|74|124|148|158|178)|AVRO RJ|BOEING (?:707|717|727)|BRITISH AEROSPACE 146|COMAC |DOUGLAS DC-|EMBRAER (?:EMB-1(?:35|40|45)|ERJ)|FOKKER (?:70|100)|ILYUSHIN Il-(?:62|86|96)|IRKUT MC-|MCDONNELL[ -]DOUGLAS (?:DC-|MD-)|SUKHOI Superjet|TUPOLEV Tu-(?:134|154|204|214)|YAKOVLEV Yak-(?:40|42))/i;

const result=family=>({family,label:familyLabels[family]});

export function resolveAircraftFamily(code){
 const normalized=typeof code==='string'?code.trim().toUpperCase():'';
 if(!Object.hasOwn(aircraftTypes,normalized))return result('unknown');
 const identity=aircraftTypes[normalized];

 const namedFamily=codeFamilies.get(normalized);
 if(namedFamily)return result(namedFamily);
 if(fighterCodes.has(normalized))return result('fighter');

 const [description='',configuration='',weight='']=identity;
 const airframe=configuration[0];
 const engineCount=Number.parseInt(configuration[1],10);
 const engineType=configuration[2];

 if(airframe==='B')return result('balloon');
 if(description.toLowerCase().includes('glider')||(engineCount===0&&['L','S','A'].includes(airframe)))return result('glider');
 if(['H','G','R'].includes(airframe))return result('helicopter');
 if(engineType==='J'){
  if(smallBusinessJetCodes.has(normalized))return result('jet-small');
  if(weight==='H')return result('jet-heavy');
  if(commercialJetPattern.test(description))return result('jet-airliner');
  return result(weight==='M'?'jet-large':'jet-small');
 }
 if(engineType==='T')return result(engineCount===1?'prop-single-large':engineCount>=4?'prop-heavy':'turboprop');
 if(['P','E'].includes(engineType))return result(engineCount===1?'prop-single':engineCount>1?'prop-twin':'unknown');
 return result('unknown');
}
