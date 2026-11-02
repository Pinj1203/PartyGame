import {run} from './harness.mjs';
run(`
clean();const a=addSurface('platform',0,0,0,0,8,8,true);addSurface('platform',100,40,0);addSurface('platform',216,40,24);const b=addSurface('platform',14,0,0,0,8,8,true);resetPlayers(6);phase='race';expert=true;
const p=players[1];players.forEach(q=>q.alive=q===p);Object.assign(p,{x:-1,y:0,z:0,vx:0,vz:0,vy:0,ground:a,facing:0});p.mesh.position.set(p.x,p.y,p.z);
const link=divePlanner.link(a,b);console.log('LINK',link&&{delay:link.delay,takeoff:link.takeoff,landing:link.landing,margin:link.margin},'route',route(a,p).map(s=>s.x));
for(let i=0;i<600&&p.alive;i++){raceTime+=1/60;move(p,1/60,bot(p,1/60));updateCombat(players,1/60);if(i%15===0||p.diving)console.log(i,p.x.toFixed(2),p.y.toFixed(2),p.vx.toFixed(2),p.vy.toFixed(2),p.ground?.x,p.aiDivePlan,p.diving,p.aiDiveCount);if(p.ground===b&&!isDiving(p)){console.log('LANDED',i,p.x);break;}}
console.log('END',p.alive,p.aiDiveCount,p.ground?.x);
`);