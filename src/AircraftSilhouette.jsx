import React from 'react';
import {aircraftShape,models} from './aircraft-shape';
export {models,shapeDescription} from './aircraft-shape';
// Both model and approximate family footprints use the map's metre coordinates.
export function AircraftSilhouette({model,kind}) {
 const shape=aircraftShape(model,kind);
 return <svg className="model-silhouette" data-model={model||undefined} data-family={shape.family} data-approximate={shape.approximate||undefined} data-length-m={shape.length} data-wingspan-m={shape.wingspan} x={-shape.wingspan/2} y={-shape.length/2} width={shape.wingspan} height={shape.length} viewBox={shape.bounds.join(' ')} preserveAspectRatio="none" aria-hidden="true"><path d={shape.path} fill="currentColor"/></svg>;
}
export function spanLabel(model){return models[model]?.kind==='helicopter'?'rotor diameter':'span';}
export function AircraftMarker({flight}){
 const shape=aircraftShape(flight.model,flight.kind);
 return <g className={!flight.headingKnown?'orientation-unknown':undefined}><AircraftSilhouette model={flight.model} kind={flight.kind}/>{!flight.headingKnown&&<circle className="unknown-heading-ring" r={Math.max(shape.wingspan,shape.length)*.56} fill="none" stroke="currentColor" strokeWidth=".6" strokeDasharray="2 3" vectorEffect="non-scaling-stroke"/>}</g>;
}
