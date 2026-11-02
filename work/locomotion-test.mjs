import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,60,60,true);resetPlayers(6);phase='race';
 const p=players[0],idle={x:0,z:0,jump:false};
 function pose(y=0){
   resetCombat(p);resetAnimal(p.mesh);
   Object.assign(p,{x:0,y,z:0,vx:7,vz:0,vy:0,ground:y===0?floor:null,jumpCD:0,facing:0,alive:true,finished:false});
   p.mesh.position.set(0,y,0);p.mesh.rotation.set(0,0,0);
 }
 const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
 // The visible body turns progressively, following the shortest arc.
 pose();move(p,1/60,{x:0,z:1,jump:false});
 assert(p.facing>0&&p.facing<.65,'first frame is responsive without snapping to the requested direction');
 for(let i=0;i<8;i++)move(p,1/60,{x:0,z:1,jump:false});
 assert(Math.abs(p.facing-Math.PI/2)<.06,'quarter-turn responds within 150 ms');
 pose();for(let i=0;i<12;i++)move(p,1/60,{x:-1,z:0,jump:false});
 assert(Math.abs(angle(p.facing,Math.PI))<.06,'full reverse responds within 200 ms');
 const facing=p.facing;move(p,1/60,idle);assert.equal(p.facing,facing,'release keeps the last facing');
 pose();p.facing=Math.PI-.05;
 move(p,1/60,{x:Math.cos(-Math.PI+.05),z:Math.sin(-Math.PI+.05),jump:false});
 assert(angle(p.facing,Math.PI-.05)>0&&angle(p.facing,Math.PI-.05)<.05,'crossing +/- pi takes the short arc');
 // Reverse input turns the body while the actual jump keeps moving forward.
 pose();move(p,1/60,{x:1,z:0,jump:true});
 for(let i=0;i<27;i++)move(p,1/60,{x:-1,z:0,jump:false});
 assert(!p.ground&&p.y>1.5,'still airborne near the apex');
 assert(Math.abs(angle(p.facing,Math.PI))<.08,'body faces backwards independently');
 assert(p.vx>3.2&&p.x>1.9,'reduced takeoff momentum still resists an instant mid-air reversal');
 // Side steering has a bounded influence; letting go preserves current momentum.
 pose(8);for(let i=0;i<30;i++)move(p,1/60,{x:0,z:1,jump:false});
 assert(p.vx>4&&p.vz>0&&p.vz<2.8&&p.z<.8,'air steering only nudges the landing point');
 const vx=p.vx,vz=p.vz;
 for(let i=0;i<12;i++)move(p,1/60,idle);
 assert.equal(p.vx,vx);assert.equal(p.vz,vz);
 // The same grounded reverse still responds quickly, and hits remain separate forces.
 pose();for(let i=0;i<18;i++)move(p,1/60,{x:-1,z:0,jump:false});
 assert(p.vx<-6,'ground control stays responsive');
 pose(8);p.vx=0;p.impulseX=3.6;
 move(p,1/60,idle);assert(p.x>0&&p.impulseX>0,'air inertia does not swallow knockback');
 function sample(fps){
   pose(20);
   for(let i=0;i<fps/2;i++)move(p,1/fps,{x:-1,z:0,jump:false});
   return {x:p.x,vx:p.vx,facing:p.facing};
 }
 const slow=sample(30),fast=sample(120);
 assert(Math.abs(slow.vx-fast.vx)<1e-6&&Math.abs(slow.x-fast.x)<.05,'air control is consistent at 30 and 120 fps');
 assert(Math.abs(angle(slow.facing,fast.facing))<.03,'turn timing is stable across frame rates');
 console.log('PASS: smooth shortest-arc turns, independent airborne facing, limited air steering, retained momentum and frame-rate consistency');
`);
