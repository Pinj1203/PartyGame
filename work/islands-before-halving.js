// Seeded compact route; every gap and rise fits the normal held-jump envelope.
export const COURSE={length:108,finishHeight:4};
export function generateIslands(seed){
 let state=seed>>>0;
 const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const between=(a,b)=>a+(b-a)*random(),integer=(a,b)=>Math.floor(between(a,b+1));
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),round=v=>Math.round(v*100)/100;
 const count=integer(6,8),start={x:0,y:0,z:0,w:16,d:18,h:between(2,7),routeIndex:0};
 const finish={x:COURSE.length,y:COURSE.finishHeight,z:0,w:16,d:18,h:between(3,8),routeIndex:count+1};
 const middle=Array.from({length:count},(_,i)=>({w:between(9,16),d:between(11,18),h:between(1,9),routeIndex:i+1}));
 const gaps=Array.from({length:count+1},()=>between(1.15,1.65));
 const scale=(COURSE.length-16-gaps.reduce((a,b)=>a+b,0)-count*7)/middle.reduce((n,s)=>n+s.w,0);
 for(const s of middle)s.w=7+s.w*scale;
 const primary=[start,...middle,finish],phase=between(0,Math.PI*2);
 for(let i=1;i<primary.length-1;i++){
  const s=primary[i],prev=primary[i-1],remaining=count+1-i;
  s.x=prev.x+prev.w/2+gaps[i-1]+s.w/2;
  const low=Math.max(0,prev.y-1.1,COURSE.finishHeight-remaining*1.1);
  const high=Math.min(6,prev.y+1.1,COURSE.finishHeight+remaining*1.1);
  s.y=clamp(COURSE.finishHeight*i/(count+1)+Math.sin(i*1.1+phase)*1.5+between(-.35,.35),low,high);
  // Keep at least 6m of shared landing corridor, including the final step.
  const side=Math.min(3.8,(prev.d+s.d)/2-6);
  s.z=clamp(prev.z+between(-side,side),-9,9);
  if(i===count)s.z=clamp(s.z,-(s.d+finish.d)/2+6,(s.d+finish.d)/2-6);
 }
 const mid=middle[Math.floor(middle.length/2)];
 return [start,mid,finish,...middle.filter(s=>s!==mid)].map(s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,round(v)])));
}
