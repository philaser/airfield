import {useLayoutEffect,useEffect,useState} from 'react';
import {reconcilePresence} from './presence.js';
export function usePresence(items,scope){
 const [state,setState]=useState(()=>({scope,entries:items.map(item=>({...item,exiting:false}))}));
 useLayoutEffect(()=>{setState(old=>({scope,entries:reconcilePresence(old.scope===scope?old.entries:[],items,Date.now())}));},[items,scope]);
 useEffect(()=>{
  const deadlines=state.entries.filter(f=>f.exiting).map(f=>f.removeAt);if(!deadlines.length)return;
  const timer=setTimeout(()=>setState(old=>({...old,entries:old.entries.filter(f=>!f.exiting||f.removeAt>Date.now())})),Math.max(0,Math.min(...deadlines)-Date.now())+1);
  return()=>clearTimeout(timer);
 },[state]);
 return state.scope===scope?state.entries:[];
}
