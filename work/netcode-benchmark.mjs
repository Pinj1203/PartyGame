import {run} from './harness.mjs';
run(`
 clean();makeMap(0);resetPlayers(6);phase='race';raceTime=0;
 const floor=addSurface('platform',20,0,0,0,100,20,true);
 const types=['movingHorizontal','movingVertical','spinner','pendulum','hammer','rotate'];
 for(let i=0;i<36;i++)addSurface(types[i%types.length],15+(i%9)*8,20+Math.floor(i/9)*10,3);
 const p=players[0];Object.assign(p,{x:20,y:.002,z:0,ground:floor,predTime:0});
 const command={x:0,z:0,jump:false,actions:{jump:0,dive:0,punch:0}};
 const times=[];
 for(let batch=0;batch<80;batch++){
  const started=performance.now();
  for(let n=0;n<12;n++)predictStep(p,command,STEP,1+n*STEP);
  times.push(performance.now()-started);
 }
 times.splice(0,10);times.sort((a,b)=>a-b);
 console.log(JSON.stringify({scenario:'36 mechanisms, 12-command replay',medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)]}));
`);
