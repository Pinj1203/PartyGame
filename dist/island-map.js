// Sparse seeded islands. Players build the missing route across the gaps.
export const COURSE={length:80,finishHeight:2};
export function generateIslands(seed){
 let state=seed>>>0;
 const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const between=(a,b)=>a+(b-a)*random(),integer=(a,b)=>Math.floor(between(a,b+1));
 const round=v=>Math.round(v*100)/100;
 const count=integer(0,1),start={x:0,y:0,z:0,w:13.5,d:15,h:between(1.6,5.6),routeIndex:0};
 const finish={x:COURSE.length,y:COURSE.finishHeight,z:0,w:13.5,d:15,h:between(2.4,6.4),routeIndex:count+1};
 const middle=Array.from({length:count},(_,i)=>({
  x:between(COURSE.length*.3,COURSE.length*.7),y:between(0,6),z:between(-12,12),
  w:between(7,11),d:between(9,14),h:between(.8,7),routeIndex:i+1
 }));
 return [start,...middle,finish].map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,round(v)])));
}
