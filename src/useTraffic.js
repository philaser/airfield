import {useEffect,useState} from 'react';
export function useTraffic(airport,paused){
 const [state,setState]=useState({airportId:null,snapshot:null,state:'loading',retryAt:0});
 useEffect(()=>{
  let stopped=false,timer,controller;
  setState(s=>s.airportId===airport.id?s:{airportId:airport.id,snapshot:null,state:'loading',retryAt:0});
  async function poll(){
   if(stopped||paused||document.hidden||controller)return;
   controller=new AbortController();let delay=10000;
   try{
    const r=await fetch(`/api/traffic?airport=${encodeURIComponent(airport.id)}`,{signal:controller.signal});if(!r.ok)throw new Error();
    const data=await r.json();if(!['current','stale','unavailable'].includes(data.state))throw new Error();
    if(!stopped)setState({...data,airportId:airport.id});delay=Math.max(5000,(data.retryAt||0)-Date.now(),data.state==='current'?10000:0);
   }catch{if(!stopped)setState(s=>({...s,state:'unavailable',message:'Connection interrupted. Retrying automatically.'}));delay=60000;}
   controller=null;if(!stopped)timer=setTimeout(poll,delay);
  }
  function visibility(){clearTimeout(timer);if(!document.hidden)poll();}
  poll();document.addEventListener('visibilitychange',visibility);
  return()=>{stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);};
 },[airport.id,paused]);
 return state.airportId===airport.id?state:{snapshot:null,state:'loading',retryAt:0};
}
