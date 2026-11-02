import {run} from './harness.mjs';
run(`
clean();makeMap(1);resetPlayers(8);expert=true;round=1;
assert.equal(surfaces[2].x,216,'doubled course length');
assert.equal(surfaces[2].y,24,'raised finish');
assert(surfaces.length>=15&&surfaces.length<=23,'random island count');assert(surfaces.every(s=>s.fixed&&s.type==='platform'),'no authored facilities');assert.equal(facilities.facilities.length,0);
players[0].pick='platform';
assert(legal({x:200,z:40,y:30}),'expanded build volume');
assert(route(surfaces[0],players[1]).length>0,'some close islands are already jumpable');
for(let i=0;i<64&&route(surfaces[0],players[1]).at(-1)!==surfaces[2];i++){const spot=suggest('platform',0);assert(legal(spot,'platform',0),'AI proposes legal bridge pieces');addSurface('platform',spot.x,spot.z,spot.y);}
assert.equal(route(surfaces[0],players[1]).at(-1),surfaces[2],'placing platforms builds a route to the finish');
console.log('Bridged islands:',surfaces.length,'surfaces');
phase='race';raceTime=0;
for(let i=0;i<MAP.raceSeconds*60;i++){
 raceTime+=1/60;traps(1/60);
 for(const p of players)if(p.alive&&!p.finished){move(p,1/60,bot(p,1/60));updateCombat([p],1/60);}
}
const finished=players.filter(p=>p.finished).length;
console.log('AI finished:',finished,'/',players.length,players.map(p=>[p.x.toFixed(1),p.y.toFixed(1),p.alive]));
for(const p of players.filter(p=>p.alive))console.log({x:p.x,y:p.y,z:p.z,ground:p.ground?.id,plan:p.plan.map(s=>[s.id,s.x,s.y,s.z,s.designWidth,s.designDepth]),runup:p.aiRunup});console.log(surfaces.filter(s=>s.x>65&&s.x<110).map(s=>({id:s.id,x:s.x,y:s.y,z:s.z,w:s.designWidth,d:s.designDepth,h:s.designHeight})));
`);