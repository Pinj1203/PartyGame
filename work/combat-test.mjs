import {run} from './harness.mjs';
run(`
 clean();makeMap();resetPlayers(6);phase='race';raceTime=2;
 const a=players[0],b=players[1],c=players[2];
 function pose(p,x,z=0,y=0){resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x,z,y,vx:0,vz:0,vy:0,alive:true,finished:false,ground:surfaces[0]});p.mesh.position.set(x,y,z);}
 players.forEach((p,i)=>pose(p,20+i*2));
 pose(a,0);pose(b,1.2);pose(c,1.4);
 let hits=0;
 assert(startPunch(a,0));
 assert(!startPunch(a,0),'cooldown prevents click spam');
 updateCombat(players,.10,()=>hits++);
 assert.equal(hits,0,'windup must finish before impact');
 updateCombat(players,.03,()=>hits++);
 assert.equal(hits,1);assert.equal(b.hitSerial,1);assert.equal(c.hitSerial,0,'one nearest target');
 for(let i=0;i<20;i++)updateCombat(players,.02,()=>hits++);
 assert.equal(hits,1,'a swing cannot hit repeatedly');
 assert(!b.ragdoll?.active&&!isDown(b)&&!b.pendingKnockdown,'punch never schedules a knockdown');
 assert.equal(b.vy,0,'grounded punches do not launch upward');assert.equal(b.ground,surfaces[0]);
 pose(c,30);const before=b.x;
 for(let i=0;i<120;i++)move(b,1/120,{x:0,z:0,jump:false});
 assert(b.x-before>.7&&b.x-before<.85,'a punch gives a small horizontal push');
 assert(!isDown(b)&&!b.ragdoll?.active,'stays standing after knockback settles');
 pose(a,0);pose(b,1.2);startPunch(a);updateCombat(players,.13);
 b.jumpCD=0;move(b,1/60,{x:0,z:0,jump:true});
 assert(b.vy>9&&!isDown(b),'a punched player can still jump');
 function distanceAt(fps){pose(b,1.2);b.impulseX=3.6;for(let i=0;i<fps;i++)integrateImpulse(b,1/fps);return b.x;}
 assert(Math.abs(distanceAt(30)-distanceAt(120))<1e-6,'knockback independent of frame rate');
 for(const [x,z,y] of [[-1,0,0],[0,1.5,0],[1,0,2],[3,0,0]]){
   pose(a,0);pose(b,x,z,y);pose(c,30);startPunch(a,0);updateCombat(players,.13);
   assert.equal(b.hitSerial,0,'exclude behind, side, overhead and far targets');
 }
 pose(a,0);pose(b,1.2);b.finished=true;startPunch(a,0);updateCombat(players,.13);assert.equal(b.hitSerial,0);
 pose(a,0);pose(b,1.2);startPunch(a,0);updateCombat(players,.13,()=>{},()=>true);assert.equal(b.hitSerial,0,'solid cover blocks a punch');
 pose(a,0);pose(b,1.2);phase='build';renderer.domElement.emit('pointerdown',{button:0});assert.equal(a.punchSerial,0,'building clicks never attack');
 phase='race';yaw=0;renderer.domElement.emit('pointerdown',{button:2});assert.equal(a.punchSerial,0);
 assert.equal(a.grabbing,b.i,'right click grabs instead of punching');window.emit('pointerup',{button:2});
 renderer.domElement.emit('pointerdown',{button:0});assert.equal(a.punchSerial,1,'left click attacks');
 // Actual loaded glTF clones have independent bones, materials and animations.
 const ar=a.mesh.userData.animal,br=b.mesh.userData.animal;
 assert(ar.bones.get('Head')!==br.bones.get('Head'));
 assert(ar.materials[0]!==br.materials[0]);
 animateAnimal(a,1/60);animateAnimal(b,1/60);
 assert.equal(ar.action,'Idle');assert.equal(br.action,'Idle');
 pose(b,1.2);b.hitSerial++;b.lastImpactX=1;b.stagger=.24;
 for(let i=0;i<60;i++)animateAnimal(b,1/60);
 assert(Number.isFinite(br.lean.x));assert(Math.abs(br.lean.x)<.1,'physical lean settles');
 pose(a,0);pose(b,0);resolvePlayerContacts(players,1/60);
 assert(Math.hypot(a.x-b.x,a.z-b.z)>0,'overlapping bodies separate');
 spawn();assert(players.every(p=>p.impulseX===0&&p.punchTime===-1&&p.stagger===0),'round reset clears combat');
 // Practice is also a playable browser route for direct combat testing.
 $('count').value='6';practice();assert(practiceMode&&phase==='race');
 for(let i=0;i<90;i++)tick(last+1000/60);
 assert(players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.mesh.quaternion.w)));
 console.log('PASS: punch windup/cooldown/range/cover, small consistent knockback, physical recovery, independent character rigs and practice arena');
`);
