import models from './aircraft-models.json' with {type:'json'};
import {resolveAircraftFamily} from './aircraft-families.js';
import {familyShapes} from './aircraft-family-shapes.js';
export {models};

export function aircraftShape(model,kind){
 const code=typeof model==='string'?model.trim().toUpperCase():'';
 if(Object.hasOwn(models,code))return {...models[code],family:code,approximate:false};
 const match=resolveAircraftFamily(code);
 const family=match.family==='unknown'&&kind==='helicopter'?'helicopter':match.family;
 const shape=models[family]||familyShapes[family]||familyShapes.unknown;
 return {...shape,family,label:family==='helicopter'?'Helicopter family':match.label,approximate:true};
}
export function shapeDescription(flight,full=false){
 if(flight.vehicle)return 'Approximate 2.5 × 6 m footprint';
 const shape=aircraftShape(flight.model,flight.kind);
 if(shape.approximate)return `${shape.label} · approximate shape`;
 const span=shape.kind==='helicopter'?'rotor diameter':'span';
 return `${shape.wingspan} m nominal ${span}${full?` × ${shape.length} m ${shape.kind==='helicopter'?'overall (D-value)':'long'}`:''}`;
}
