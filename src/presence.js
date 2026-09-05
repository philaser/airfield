export const EXIT_MS=360;
export function reconcilePresence(previous,items,now){
 const incoming=new Map(items.map(item=>[item.id,item]));
 const result=[];
 // Retain existing order while disappearing rows fade, and refresh live data in place.
 for(const old of previous){
  if(incoming.has(old.id)){result.push({...incoming.get(old.id),exiting:false});incoming.delete(old.id);}
  else if(!old.exiting)result.push({...old,exiting:true,removeAt:now+EXIT_MS});
  else if(old.removeAt>now)result.push(old);
 }
 for(const item of incoming.values())result.push({...item,exiting:false});
 return result;
}
