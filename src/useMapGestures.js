import {useEffect,useRef,useState} from 'react';
import {clampMapZoom,mapScreenTransform,panForMapAnchor,screenToMapPoint} from './map-gestures.js';

const DRAG_THRESHOLD=4;
const CLICK_SUPPRESSION_MS=500;
const point=e=>[e.clientX,e.clientY];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];

export function useMapGestures({svg,bounds,zoom,pan,setZoom,setPan}){
 const pointers=useRef(new Map());
 const gesture=useRef(null);
 const zoomRef=useRef(zoom),panRef=useRef(pan);
 const suppressClick=useRef(false),suppressionTimer=useRef(null);
 const [dragging,setDragging]=useState(false);
 zoomRef.current=zoom;panRef.current=pan;

 useEffect(()=>()=>clearTimeout(suppressionTimer.current),[]);

 const updatePan=next=>{panRef.current=next;setPan(next);};
 const updateZoom=next=>{zoomRef.current=next;setZoom(next);};
 const markClickForSuppression=()=>{
  suppressClick.current=true;
  clearTimeout(suppressionTimer.current);
 };
 const expireClickSuppression=()=>{
  clearTimeout(suppressionTimer.current);
  suppressionTimer.current=setTimeout(()=>{suppressClick.current=false;},CLICK_SUPPRESSION_MS);
 };
 const beginPan=(entry,alreadyDragging=false)=>{
  gesture.current={type:'pan',pointerId:entry.pointerId,start:entry.client,startPan:[...panRef.current],moved:alreadyDragging};
  setDragging(alreadyDragging);
 };
 const beginPinch=()=>{
  const touches=[...pointers.current.values()].filter(entry=>entry.pointerType==='touch');
  if(touches.length<2)return false;
  const first=touches[0],second=touches[1];
  const startMidpoint=midpoint(first.client,second.client);
  const rect=svg.current.getBoundingClientRect();
  gesture.current={
   type:'pinch',pointerIds:[first.pointerId,second.pointerId],startDistance:Math.max(1,distance(first.client,second.client)),
   startZoom:zoomRef.current,anchor:screenToMapPoint({bounds,zoom:zoomRef.current,pan:panRef.current,rect,client:startMidpoint}),
  };
  markClickForSuppression();setDragging(true);return true;
 };
 const rebaseAfterPointerEnds=pointerId=>{
  if(!pointers.current.has(pointerId))return;
  pointers.current.delete(pointerId);
  if(beginPinch())return;
  const remaining=[...pointers.current.values()][0];
  if(remaining){beginPan(remaining,gesture.current?.type==='pinch'||gesture.current?.moved);return;}
  if(gesture.current?.type==='pinch'||gesture.current?.moved)expireClickSuppression();
  gesture.current=null;setDragging(false);
 };

 const onPointerDown=e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const entry={pointerId:e.pointerId,pointerType:e.pointerType,client:point(e)};
  pointers.current.set(e.pointerId,entry);
  try{e.target.setPointerCapture(e.pointerId);}catch{}
  if(!beginPinch()&&!gesture.current)beginPan(entry);
 };
 const onPointerMove=e=>{
  const entry=pointers.current.get(e.pointerId);
  if(!entry)return;
  entry.client=point(e);
  const active=gesture.current;
  if(active?.type==='pan'&&active.pointerId===e.pointerId){
   const moved=distance(active.start,entry.client);
   if(!active.moved&&moved<DRAG_THRESHOLD)return;
   if(!active.moved){active.moved=true;markClickForSuppression();setDragging(true);}
   const rect=svg.current.getBoundingClientRect();
   const {scale}=mapScreenTransform(bounds,zoomRef.current,active.startPan,rect);
   updatePan([active.startPan[0]-(entry.client[0]-active.start[0])/scale,active.startPan[1]-(entry.client[1]-active.start[1])/scale]);
   return;
  }
  if(active?.type==='pinch'){
   const first=pointers.current.get(active.pointerIds[0]),second=pointers.current.get(active.pointerIds[1]);
   if(!first||!second)return;
   const rect=svg.current.getBoundingClientRect();
   const nextZoom=clampMapZoom(active.startZoom*distance(first.client,second.client)/active.startDistance);
   const nextPan=panForMapAnchor({bounds,zoom:nextZoom,rect,anchor:active.anchor,client:midpoint(first.client,second.client)});
   updateZoom(nextZoom);updatePan(nextPan);
  }
 };
 const onPointerUp=e=>{
  const entry=pointers.current.get(e.pointerId);if(entry)entry.client=point(e);
  rebaseAfterPointerEnds(e.pointerId);
 };
 const onPointerCancel=e=>rebaseAfterPointerEnds(e.pointerId);
 const onLostPointerCapture=e=>rebaseAfterPointerEnds(e.pointerId);
 const onClickCapture=e=>{
  if(!suppressClick.current)return;
  e.preventDefault();e.stopPropagation();suppressClick.current=false;clearTimeout(suppressionTimer.current);
 };

 return {dragging,onPointerDown,onPointerMove,onPointerUp,onPointerCancel,onLostPointerCapture,onClickCapture};
}
