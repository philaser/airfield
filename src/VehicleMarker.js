import {createElement} from 'react';
// A consistent approximate footprint in map metres, not measured vehicle dimensions.
export function VehicleMarker(){
 return createElement('rect',{'data-vehicle-footprint':'approximate',x:-1.25,y:-3,width:2.5,height:6,rx:.4,fill:'currentColor'});
}
