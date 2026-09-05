import React from 'react';
import models from './aircraft-models.json';
import symbols from './aircraft-symbols.json';
export {models};
// One parent map unit is one metre. Only the invisible hit target uses pixels.
export function AircraftSilhouette({model}) {
 const shape=models[model];if(!shape)return null;
 return <svg className="model-silhouette" data-model={model} data-length-m={shape.length} data-wingspan-m={shape.wingspan} x={-shape.wingspan/2} y={-shape.length/2} width={shape.wingspan} height={shape.length} viewBox={shape.bounds.join(' ')} preserveAspectRatio="none" aria-hidden="true"><path d={shape.path} fill="currentColor"/></svg>;
}
export function spanLabel(model){return models[model]?.kind==='helicopter'?'rotor diameter':'span';}
export function AircraftMarker({flight,size}){
 const known=models[flight.model];
 if(known)return <g className={!flight.headingKnown?'orientation-unknown':undefined}><AircraftSilhouette model={flight.model}/>{!flight.headingKnown&&<circle className="unknown-heading-ring" r={Math.max(known.wingspan,known.length)*.56} fill="none" stroke="currentColor" strokeWidth=".6" strokeDasharray="2 3" vectorEffect="non-scaling-stroke"/>}</g>;
 if(flight.kind==='helicopter'){
  const shape=symbols.helicopter;
  return <svg data-symbol="helicopter" x={-size*.4} y={-size*.4} width={size*.8} height={size*.8} viewBox={shape.bounds.join(' ')} aria-hidden="true"><path d={shape.path} fill="currentColor"/></svg>;
 }
 return <circle data-symbol="unknown-aircraft" r={size*.15} fill="currentColor"/>;
}
