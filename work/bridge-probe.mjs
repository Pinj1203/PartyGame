import {run} from './harness.mjs';
run(`
clean();makeMap();resetPlayers(8);expert=true;round=1;
assert.equal(surfaces[2].x,216,'doubled course length');
assert.equal(surfaces[2].y,24,'raised finish');
assert.equal(surfaces.length,9,'original nine floating islands');assert(surfaces.every(s=>s.fixed&&s.type==='platform'),'no authored facilities');assert.equal(facilities.facilities.length,0);
players[0].pick='platform';
assert(legal({x:200,z:40,y:30}),'expanded build volume');
assert.equal(route(surfaces[0],players[1]).length,0,'building is required before any forward progress');
const islands=[...surfaces].sort((a,b)=>a.x-b.x);for(let i=1;i<islands.length;i++){assert(gap(islands[i-1],islands[i])>=11.99,'large empty gaps');assert(!canTraverse(islands[i-1],islands[i]),'no unaided jump or jump-dive between islands');}
for(let i=0;i<64&&route(surfaces[0],players[1]).at(-1)!==surfaces[2];i++){const spot=suggest('platform');assert(legal(spot,'platform',0),'AI proposes legal bridge pieces');addSurface('platform',spot.x,spot.z,spot.y);}
assert.equal(route(surfaces[0],players[1]).at(-1),surfaces[2],'placing platforms builds a route to the finish');
console.log('Bridged islands:',surfaces.length,'surfaces');
phase='race';raceTime=0;
for(let i=0;i<MAP.raceSeconds*60;i++){
 raceTime+=1/60;traps(1/60);
 for(const p of players)if(p.alive&&!p.finished){move(p,1/60,bot(p,1/60));updateCombat([p],1/60);}
}
const finished=players.filter(p=>p.finished).length;
console.log('AI finished:',finished,'/',players.length,players.map(p=>[p.x.toFixed(1),p.y.toFixed(1),p.alive]));
console.log(players[1].plan.map(s=>({x:s.x,y:s.y,top:walkY(s),w:s.w})),players[1].ground?.x,players[1].aiRunup,players[1].aiDivePlan,players[1].vx,players[1].vz,players[1].z);console.log(surfaces.filter(s=>s.x>190).map(s=>[s.x,s.y,s.z]));
`);