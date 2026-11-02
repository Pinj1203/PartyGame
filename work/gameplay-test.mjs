import {run} from './harness.mjs';
run(`
clean();makeMap(1);resetPlayers(8);expert=true;round=1;
assert.equal(goalSurface().x,80,'doubled course length');
assert.equal(goalSurface().y,2,'reachable raised finish');
assert(surfaces.length>=2&&surfaces.length<=3,'random island count');assert(surfaces.every(s=>s.fixed&&s.type==='platform'),'no authored facilities');assert.equal(facilities.facilities.length,0);
players[0].pick='platform';
assert(legal({x:MAP.buildMaxX-1,z:40,y:30}),'compact build volume');
assert.equal(route(surfaces[0],players[1]).length,0,'the initial islands leave gaps for player construction');
for(let i=0;i<64&&!route(surfaces[0],players[1]).includes(goalSurface());i++){
 const pos=suggest('platform');assert(legal(pos,'platform'));addSurface('platform',pos.x,pos.z,pos.y);
}
assert.equal(route(surfaces[0],players[1]).at(-1),goalSurface(),'player-built platforms can connect the route');
phase='race';raceTime=0;
for(let i=0;i<MAP.raceSeconds*60;i++){
 raceTime+=1/60;traps(1/60);
 for(const p of players)if(p.alive&&!p.finished){move(p,1/60,bot(p,1/60));updateCombat([p],1/60);}
}
const finished=players.filter(p=>p.finished).length;
console.log('AI finished:',finished,'/',players.length,players.map(p=>[p.x.toFixed(1),p.y.toFixed(1),p.alive]));
assert(finished>=6,'AI physically completes the player-built course');
endRound();
assert(players.some(p=>p.score>0),'scores awarded');
const savedScore=players[0].score,savedCount=surfaces.length;
beginRound();
assert.equal(players[0].score,savedScore);
assert.equal(surfaces.length,savedCount);
clean();makeMap();resetPlayers(6);
for(const type of TYPES.map(t=>t[0]).filter(t=>t!=='ice')){
 const s=addSurface(type,15+surfaces.length*12,30,4);
 assert.equal(!!s.mesh.getObjectByName('platform-deck'),type==='platform',type+' has no shared platform');
 assert(supportAt(s,s.x,s.z),type+' has a real top surface');
 if(type!=='platform'){const corner=FACILITY_TYPES.includes(type)?3.5:1.7;if(type!=='spike')assert.equal(supportAt(s,s.x+corner,s.z+corner),null,type+' has no invisible corner floor');}
}
const p=players[0],cannon=surfaces.find(s=>s.type==='cannon');
p.x=cannon.x;p.z=cannon.z;p.y=walkY(cannon)+.02;p.vy=-1;p.jumpCD=0;
move(p,1/60,{x:0,z:0,jump:false});
assert.equal(p.ground,cannon,'standing on cannon body');
assert(Math.abs(p.y-walkY(cannon))<.01);
p.x=cannon.x+1.7;p.z=cannon.z+1.7;p.y=cannon.y+.03;p.vy=-1;
move(p,1/60,{x:0,z:0,jump:false});
assert.equal(p.ground,null,'no invisible platform beside cannon');
const bounce=surfaces.find(s=>s.type==='bounce');
resetCombat(p);p.alive=true;p.x=bounce.x;p.z=bounce.z;p.y=walkY(bounce)+.02;p.vy=-1;p.jumpCD=0;
move(p,1/60,{x:0,z:0,jump:false});assert(p.vy>10,'trampoline actual surface bounces');
const spike=surfaces.find(s=>s.type==='spike');
p.x=spike.x;p.z=spike.z;p.y=walkY(spike);p.vy=0;p.alive=true;
move(p,1/60,{x:0,z:0,jump:false});assert(p.alive&&p.ragdoll.active&&p.ragdoll.nodes.get('Body').velocity.y>0,'spikes instantly launch a ragdoll instead of killing');
raceTime=20;traps(1/60);assert(shots.length>0);assert(waves.length>0);
clean();addSurface('platform',0,0,0,0,14,18,true);addSurface('platform',108,0,12,0,14,20,true);addSurface('platform',216,0,24,0,18,24,true);resetPlayers(6);phase='race';
for(let i=0;i<1800;i++)for(const p of players)if(p.alive&&!p.finished)move(p,1/60,bot(p,1/60));
assert(players.every(p=>!p.alive),'unreachable AI jumps off');
console.log('PASS: sparse map, real device surfaces, no invisible platforms, hazards, AI, scoring, persistence');
`);
