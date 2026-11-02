// Seeded layout: identical geometry on every client, stable across all rounds.
export function generateIslands(seed){
 let state=seed>>>0;
 const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const between=(a,b)=>a+(b-a)*random(),integer=(a,b)=>Math.floor(between(a,b+1));
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),round=v=>Math.round(v*100)/100;
 const start={x:0,y:0,z:0,w:between(14,18),d:between(16,23),h:between(2,7),routeIndex:0};
 const count=integer(10,14),finish={x:216,y:24,z:0,w:between(16,23),d:between(17,26),h:between(3,10),routeIndex:count+1};
 const middle=Array.from({length:count},(_,i)=>{
  const shape=integer(0,3);
  return {w:shape===0?between(4,7):shape===1?between(14,20):between(7,13),
   d:shape===0?between(14,22):shape===1?between(4,8):between(7,17),
   h:shape===2?between(7,13):between(.8,5.5),routeIndex:i+1};
 });
 const span=216-start.w/2-finish.w/2;
 const widthScale=span*between(.61,.67)/middle.reduce((n,s)=>n+s.w,0);
 for(const s of middle)s.w*=widthScale;
 const edges=Array.from({length:count+1},(_,i)=>({short:i===0||i%3===1,gap:between(1.8,3.5),weight:between(.7,1.3)}));
 const longBudget=span-middle.reduce((n,s)=>n+s.w,0)-edges.filter(e=>e.short).reduce((n,e)=>n+e.gap,0);
 const weights=edges.filter(e=>!e.short).reduce((n,e)=>n+e.weight,0);
 for(const e of edges)if(!e.short)e.gap=longBudget*e.weight/weights;
 const primary=[start,...middle,finish],phase=between(0,Math.PI*2);
 for(let i=1;i<primary.length;i++){
  const s=primary[i],prev=primary[i-1],edge=edges[i-1];
  if(i<primary.length-1)s.x=prev.x+prev.w/2+edge.gap+s.w/2;
  const remaining=edges.slice(i),rise=remaining.reduce((n,e)=>n+(e.short?1.2:7),0),fall=remaining.reduce((n,e)=>n+(e.short?1.2:6),0);
  const low=Math.max(.2,prev.y-(edge.short?1.2:6),24-rise);
  const high=Math.min(34,prev.y+(edge.short?1.2:7),24+fall);
  const desired=edge.short?prev.y+between(-.8,1.15):s.x/9+Math.sin(i*.9+phase)*9+between(-5,5);
  s.y=i===primary.length-1?24:clamp(desired,low,high);
  const lateralLimit=edge.short?Math.max(1,(prev.d+s.d)/2-3):16;
  s.z=i===primary.length-1?0:clamp(Math.sin(i*.72+phase)*24+between(-5,5),Math.max(-31,prev.z-lateralLimit),Math.min(31,prev.z+lateralLimit));
  // A short final gap must also overlap laterally with the finish platform.
  if(i===primary.length-2&&edges[i].short)s.z=clamp(s.z,-(s.d+finish.d)/2+3,(s.d+finish.d)/2-3);
 }
 const branches=[];
 const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+.3&&Math.abs(a.z-b.z)<(a.d+b.d)/2+.3&&a.y-a.h<b.y+.1&&a.y>b.y-b.h-.1;
 const wanted=integer(3,7);
 for(let attempt=0;attempt<120&&branches.length<wanted;attempt++){
  const parent=middle[integer(0,middle.length-1)],side=random()<.5?-1:1;
  const s={w:between(4,13),d:between(4,14),h:between(1,12),routeIndex:null};
  s.x=clamp(parent.x+between(-7,7),15,202);
  s.z=parent.z+side*(parent.d/2+s.d/2+between(1.7,6));
  s.y=clamp(parent.y+between(-7,9),.3,36);
  if(Math.abs(s.z)+s.d/2>44||[...primary,...branches].some(b=>overlaps(s,b)))continue;
  branches.push(s);
 }
 // Keep the established start / midpoint / finish IDs for scoring and respawn.
 const mid=middle[Math.floor(middle.length/2)];
 return [start,mid,finish,...middle.filter(s=>s!==mid),...branches].map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,typeof v==='number'?round(v):v])));
}
