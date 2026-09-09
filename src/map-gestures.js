export const MIN_MAP_ZOOM=1;
export const MAX_MAP_ZOOM=12;

export const clampMapZoom=zoom=>Math.min(MAX_MAP_ZOOM,Math.max(MIN_MAP_ZOOM,zoom));

export function mapView(bounds,zoom,pan){
 return [
  bounds[0]+bounds[2]*(1-1/zoom)/2+pan[0],
  bounds[1]+bounds[3]*(1-1/zoom)/2+pan[1],
  bounds[2]/zoom,
  bounds[3]/zoom,
 ];
}

export function mapScreenTransform(bounds,zoom,pan,rect){
 const view=mapView(bounds,zoom,pan);
 const scale=Math.min(rect.width/view[2],rect.height/view[3]);
 return {
  view,
  scale,
  offsetX:(rect.width-view[2]*scale)/2,
  offsetY:(rect.height-view[3]*scale)/2,
 };
}

export function screenToMapPoint({bounds,zoom,pan,rect,client}){
 const {view,scale,offsetX,offsetY}=mapScreenTransform(bounds,zoom,pan,rect);
 return [
  view[0]+(client[0]-rect.left-offsetX)/scale,
  view[1]+(client[1]-rect.top-offsetY)/scale,
 ];
}

export function panForMapAnchor({bounds,zoom,rect,anchor,client}){
 const viewWidth=bounds[2]/zoom,viewHeight=bounds[3]/zoom;
 const scale=Math.min(rect.width/viewWidth,rect.height/viewHeight);
 const offsetX=(rect.width-viewWidth*scale)/2;
 const offsetY=(rect.height-viewHeight*scale)/2;
 const viewX=anchor[0]-(client[0]-rect.left-offsetX)/scale;
 const viewY=anchor[1]-(client[1]-rect.top-offsetY)/scale;
 return [
  viewX-(bounds[0]+bounds[2]*(1-1/zoom)/2),
  viewY-(bounds[1]+bounds[3]*(1-1/zoom)/2),
 ];
}

export function zoomAroundPoint({bounds,zoom,pan,rect,client,nextZoom,nextClient=client}){
 const anchor=screenToMapPoint({bounds,zoom,pan,rect,client});
 const clampedZoom=clampMapZoom(nextZoom);
 return {
  zoom:clampedZoom,
  pan:panForMapAnchor({bounds,zoom:clampedZoom,rect,anchor,client:nextClient}),
 };
}
