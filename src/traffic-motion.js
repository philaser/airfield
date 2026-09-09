// Reports arrive about every 10s, already a few seconds old. Keep the playhead
// behind both delays so it does not reach a report, stall, then jump on ingest.
export const BUFFER_MS=20000;
const angularDelta=(a,b)=>((b-a+540)%360)-180;
function intersects(a,b,c,d){
 const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 return Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)>=Math.min(a.y,b.y)&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
}
function inside(p,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function canSmooth(a,b,features=[]){
 const dt=(b.time-a.time)/1000,distance=Math.hypot(b.x-a.x,b.y-a.y);
 if(dt<=0||dt>25||!a.headingKnown||!b.headingKnown||Math.abs(angularDelta(a.angle,b.angle))>25)return false;
 if(!Number.isFinite(a.speed)||!Number.isFinite(b.speed)||distance>Math.max(20,Math.max(a.speed,b.speed)*.514444*dt*1.6+10)||distance>1500)return false;
 if(a.speed<=1&&b.speed<=1)return false;
 for(const f of features){
  if(!f.closed||!['terminal','hangar'].includes(f.tags.aeroway))continue;
  if(inside(a,f.points)||inside(b,f.points))return false;
  if(f.points.slice(1).some((q,i)=>intersects(a,b,{x:f.points[i][0],y:f.points[i][1]},{x:q[0],y:q[1]})))return false;
 }
 return true;
}
export function createMotionBuffer(){
 const tracks=new Map();
 return {
  ingest(flights,features=[]){
   const ids=new Set(flights.map(f=>f.id));for(const id of tracks.keys())if(!ids.has(id))tracks.delete(id);
   for(const f of flights){
    const history=tracks.get(f.id)||[],previous=history.at(-1);
    if(previous&&f.observedAt<=previous.time)continue;
    const point={...f.position,time:f.observedAt,speed:f.speed,headingKnown:f.headingKnown};
    // Suppress small stationary receiver jitter without creating a moving aircraft.
    if(previous&&f.speed!==null&&f.speed<=1&&previous.speed!==null&&previous.speed<=1&&Math.hypot(point.x-previous.x,point.y-previous.y)<12){point.x=previous.x;point.y=previous.y;point.angle=previous.angle;}
    point.smooth=!!previous&&canSmooth(previous,point,features);history.push(point);if(history.length>8)history.shift();tracks.set(f.id,history);
   }
  },
  sample(id,now){
   const h=tracks.get(id);if(!h?.length)return null;const time=now-BUFFER_MS;
   if(time<=h[0].time)return h[0];
   for(let i=1;i<h.length;i++)if(time<h[i].time){const a=h[i-1],b=h[i];if(!b.smooth)return a;const t=(time-a.time)/(b.time-a.time);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:a.angle+angularDelta(a.angle,b.angle)*t};}
   return h.at(-1); // Never extrapolate beyond the last observed position.
  }
 };
}
