import {run} from './harness.mjs';
run(`
 clean();makeMap();resetPlayers(6);phase='race';
 const a=players[0],b=players[1],c=players[2],idle={x:0,z:0,jump:false};
 function pose(p,x=0,z=0,y=0){releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x,z,y,vx:0,vz:0,vy:0,alive:true,finished:false,ground:surfaces[0],facing:0});p.mesh.position.set(x,y,z);}
 players.forEach((p,i)=>pose(p,30+i*3));
 pose(a,0);pose(b,1.2);pose(c,2.1);
 assert(startGrab(a,players,0));assert.equal(b.grabbedBy,a.i);
 assert(!startGrab(b,players,0),'grabbed character cannot create a chain');
 assert(!startGrab(c,players,Math.PI),'one target cannot have two holders');
 assert(!startPunch(a));assert(!startPunch(b),'grabbed players must struggle, not punch');
 const xBefore=b.x;
 for(let i=0;i<35;i++){a.facing=0;updateGrabs(players,1/60);move(a,1/60,{x:-1,z:0,jump:false});move(b,1/60,idle);updateCombat(players,1/60);}
 assert(b.x<xBefore-.3,'moving holder actually pulls victim');
 b.struggleMoving=true;b.struggleJump=true;strugglePulse(b);
 for(let i=0;i<60&&b.grabbedBy!==null;i++)updateGrabs(players,1/60);
 assert.equal(b.grabbedBy,null,'awake players can struggle free');
 assert.equal(a.grabbing,null);assert(a.grabNeedsRelease,'held button cannot instantly regrab');
 assert(b.grabImmunity>0,'brief protection after escape');
 pose(a,0);pose(b,1.2);knockDown(b);assert(startGrab(a,players,0),'can grab downed opponent');
 for(let i=0;i<90;i++){
   strugglePulse(b);b.struggleMoving=true;b.struggleJump=true;
   updateGrabs(players,1/60);updateCombat(players,1/60);
   assert.equal(b.grabbedBy,a.i,'downed target stays grabbed');
   assert.equal(b.escapeProgress,0,'downed escape input is not banked');
 }
 animateAnimal(b,1/60);assert(b.ragdoll.active,'down pose is driven by physical joints');
 for(let i=0;i<30;i++)updateCombat(players,1/60);
 assert(b.getUpTime>0);beginRecovery(b);animateAnimal(b,1/60);assert(b.mesh.userData.animal.recovery,'recover by blending the physical pose back to locomotion');
 strugglePulse(b);updateGrabs(players,1/60);assert.equal(b.escapeProgress,0,'cannot escape during get-up');
 for(let i=0;i<40;i++)updateCombat(players,1/60);
 assert(!isDown(b),'held player still recovers');
 for(let i=0;i<5;i++)strugglePulse(b);
 updateGrabs(players,1/60);assert.equal(b.grabbedBy,null,'escape enabled after fully standing');
 pose(a,0);pose(b,1.2);assert(!startGrab(a,players,0,()=>true),'wall blocks grab');
 assert(startGrab(a,players,0));updateGrabs(players,1/60,()=>true);assert.equal(a.grabbing,b.i,'a blocked tether stays held');
 pose(a,0);pose(b,1.2);startGrab(a,players,0);b.x=5;updateGrabs(players,1/60);assert.equal(a.grabbing,b.i,'separation never silently releases the grip');
 pose(a,0);pose(b,1.2);startGrab(a,players,0);knockDown(a);updateGrabs(players,1/60);assert.equal(b.grabbedBy,null,'downed holder releases');
 pose(a,0);pose(b,1.2);startGrab(a,players,0);die(b,'test');assert.equal(a.grabbing,null,'void elimination clears grip');
 pose(a,0);pose(b,1.2);yaw=0;renderer.domElement.emit('pointerdown',{button:2});window.emit('blur',{});assert.equal(a.grabbing,null);assert(!grabHeld,'focus loss releases right button');
 // All formerly lethal hazards activate ragdoll immediately; landing enables recovery.
 pose(a,0);assert(hazardImpact(a,1,0,8,5.8));const firstSerial=a.hitSerial;
 assert(!hazardImpact(a,1,0,8,5.8),'continuous hazards cannot apply each frame');
 assert(a.alive&&a.ragdoll.active&&isDown(a));
 for(let i=0;i<180&&!a.ground;i++){move(a,1/60,idle);updateCombat(players,1/60);}
 assert(a.alive&&isDown(a)&&a.ground,'ragdoll lands before recovering');
 assert(!startPunch(a));assert(!startGrab(a,players));
 assert(!hazardImpact(a,1,0),'downed player cannot be permanently stun-locked by same hazard');
 const jumpCD=a.jumpCD;move(a,1/60,{x:1,z:0,jump:true});assert(a.ragdoll.active&&a.jumpCD<=jumpCD,'downed player cannot trigger a jump');
 for(let i=0;i<300&&isDown(a);i++){move(a,1/60,idle);updateCombat(players,1/60);}
 assert(!isDown(a)&&a.alive,'recovers without losing the round');
 pose(a,0);a.y=6;a.vy=-17;a.ground=null;
 for(let i=0;i<60&&!isDown(a);i++)move(a,1/60,idle);
 assert(isDown(a),'large ordinary falls knock down');
 // Cannon hits are consumed and waves hit each player once.
 pose(a,0);const projectile=sphere(.3,0x303f41,world);projectile.position.set(0,.8,0);
 shots=[{mesh:projectile,dx:CANNON.speed,dz:0,age:0}];advanceCannonShot(shots[0],1/60);
 assert(a.alive&&a.ragdoll.active&&shots[0].spent);
 pose(a,0);shots=[];waves=[{x:-1,z:0,y:.35,r:1}];move(a,1/60,idle);
 assert(a.alive&&a.ragdoll.active&&a.ragdoll.nodes.get('Body').velocity.x===0,'wave collapses without outward knockback');
 assert(waves[0].hitPlayers.has(a.i));
 waves=[];pose(a,0);a.y=-10;move(a,1/60,idle);assert(!a.alive,'cloud void still eliminates');
 spawn();assert(players.every(p=>!isDown(p)&&p.grabbing===null&&p.grabbedBy===null),'round restart clears all state');
 console.log('PASS: immediate hazard ragdoll/landing recovery, right-button drag, conscious escape, downed hold, release/reset lifecycle');
`);
