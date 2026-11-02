import {run} from './harness.mjs';
run(`
for(const seed of [1,2,1234]){
 clean();makeMap(seed);resetPlayers(6);expert=true;
 const count=surfaces.length;
 for(let i=0;i<64&&route(surfaces[0],players[1]).at(-1)!==surfaces[2];i++){
  const p=suggest('platform',0);if(!legal(p,'platform',0))throw Error('invalid');addSurface('platform',p.x,p.z,p.y);
 }
 const path=route(surfaces[0],players[1]);phase='race';raceTime=0;for(let i=0;i<MAP.raceSeconds*60;i++){raceTime+=1/60;for(const p of players)if(p.alive&&!p.finished){move(p,1/60,bot(p,1/60));updateCombat([p],1/60);}}console.log(seed,count,surfaces.length,path.at(-1)?.x,players.filter(p=>p.finished).length,players.map(p=>[p.x.toFixed(1),p.y.toFixed(1),p.z.toFixed(1),p.alive,p.ground?.id,p.plan[0]?.id]));
}
`);