import {run} from './harness.mjs';
run(`
for(const seed of [1,2,1234]){
 clean();makeMap(seed);resetPlayers(6);expert=true;
 const count=surfaces.length;
 for(let i=0;i<64&&route(surfaces[0],players[1]).at(-1)!==surfaces[2];i++){
  const p=suggest('platform',0);if(!legal(p,'platform',0))throw Error('invalid');addSurface('platform',p.x,p.z,p.y);
 }
 console.log(seed,count,surfaces.length,route(surfaces[0],players[1]).at(-1)?.x,reachablePlatforms().size);
}
`);