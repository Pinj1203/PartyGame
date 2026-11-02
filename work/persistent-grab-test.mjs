import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,180,80,true);resetPlayers(6);phase='race';
 const a=players[0],b=players[1],c=players[2],idle={x:0,z:0,jump:false};
 function pose(p,x=0,z=0){
   releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);
   Object.assign(p,{x,z,y:0,vx:0,vz:0,vy:0,ground:floor,alive:true,finished:false,facing:0,jumpCD:0});
   p.mesh.position.set(x,0,z);p.mesh.rotation.set(0,0,0);
 }
 players.forEach((p,i)=>pose(p,60+i*3));
 // Waiting and passive dragging do not consume a hold.
 for(const fps of [30,60,120]){
   pose(a,0);pose(b,1.1);startGrab(a,players);
   for(let i=0;i<fps*6;i++){
     updateGrabs(players,1/fps);move(a,1/fps,{x:-1,z:0,jump:false});
     move(b,1/fps,idle);updateCombat(players,1/fps);
     assert.equal(a.grabbing,b.i);assert.equal(a.facing,0);
   }
   assert(Math.hypot(a.x-b.x,a.z-b.z)<2.35,'tension bounds opposing movement without releasing');
   assert(b.x< -2,'victim is physically dragged');
 }
 pose(a);pose(b,1.1);pose(c,2.3);startGrab(a,players);
 c.facing=Math.PI;startPunch(c);updateCombat(players,.13);
 assert.equal(b.hitSerial,1);assert.equal(a.grabbing,b.i,'punch does not release victim');
 // One fresh press launches the conscious victim, using body facing not camera.
 b.facing=Math.PI/2;yaw=Math.PI;b.impulseX=b.impulseZ=0;
 window.emit('keydown',{code:'Space',repeat:false,preventDefault(){}});
 assert.equal(b.grabbedBy,a.i,'holder jumping is not victim input');
 strugglePulse(b);updateGrabs(players,1/60);
 assert.equal(b.grabbedBy,null);assert.equal(a.grabbing,null);
 assert(b.vy===COMBAT.escapeJumpSpeed&&!b.ground&&b.impulseZ>2&&Math.abs(b.impulseX)<1e-6);
 assert(b.grabImmunity===1&&a.grabNeedsRelease);
 assert(!startGrab(a,players),'held right button cannot recapture');
 // Aerial escape gives a small forward push without granting a second jump.
 pose(a);pose(b,1.1);startGrab(a,players);b.ground=null;b.vy=-3;
 strugglePulse(b);updateGrabs(players,1/60);assert.equal(b.vy,-3);
 // No progress or stored keypress can escape during knockdown/get-up.
 pose(a);pose(b,1.1);knockDown(b);startGrab(a,players);
 for(let i=0;i<30;i++){strugglePulse(b);updateGrabs(players,1/60);}
 assert.equal(b.escapeProgress,0);assert.equal(a.grabbing,b.i);
 b.downTime=0;b.getUpTime=.1;strugglePulse(b);b.getUpTime=0;
 updateGrabs(players,1/60);assert.equal(a.grabbing,b.i,'downed input cannot be banked');
 strugglePulse(b);updateGrabs(players,1/60);assert.equal(a.grabbing,null);
 // AI follows the same rules: no timer release, fresh jump input escapes.
 pose(a);pose(b,1.1);b.facing=Math.PI;startGrab(b,players);
 raceTime=100;aiPunch(b);assert.equal(b.grabbing,a.i);
 pose(a);pose(b,1.1);startGrab(a,players);
 move(b,1/60,{x:1,z:0,jump:true});updateGrabs(players,1/60);assert.equal(b.grabbedBy,null);
 // A target hitting a hazard remains attached and switches to a physical hand grip.
 pose(a);pose(b,1.1);startGrab(a,players);hitHazard(b,1,0,8,5,'test');
 updateGrabs(players,1/60);assert(b.ragdoll?.active&&b.ragdoll.grip&&a.grabbing===b.i);
 // Downed targets allow ordinary smooth turning, while the hand constraint follows.
 for(let i=0;i<20;i++){
   updateGrabs(players,1/60);move(a,1/60,{x:0,z:1,jump:false});
   move(b,1/60,idle);animateAnimal(a,1/60);
 }
 assert(a.facing>1.5&&!a.grabFacingLocked,'can turn while dragging a ragdoll');
 assert.equal(a.mesh.userData.animal.action,'Run','downed drag uses normal locomotion');
 assert.equal(a.grabbing,b.i);assert(b.ragdoll.grip);
 b.downTime=0;b.getUpTime=.3;updateGrabs(players,1/60);
 move(a,1/60,{x:1,z:0,jump:false});assert(!a.grabFacingLocked,'turning allowed through get-up');
 const newYaw=a.facing;b.getUpTime=0;updateGrabs(players,1/60);
 move(a,1/60,{x:-1,z:0,jump:false});assert(a.grabFacingLocked&&a.facing===newYaw,'standing target locks current facing');
 // The collision world still blocks dragging through a wall; no timeout release.
 pose(a,-3);pose(b,-1.9);const wall=addSurface('platform',0,0,1.1,0,1,8);
 startGrab(a,players);
 for(let i=0;i<240;i++){updateGrabs(players,1/60,punchBlocked);move(a,1/60,{x:1,z:0,jump:false});move(b,1/60,idle);updateCombat(players,1/60);}
 assert(a.x<-.85&&b.x<-.85);assert.equal(a.grabbing,b.i);
 // Eight walking directions keep facing locked and produce anatomically attached feet.
 const tracks=[];
 for(let index=0;index<8;index++){
   pose(a,-20);pose(b,-18.9);startGrab(a,players);
   const dir=index*Math.PI/4,vx=Math.cos(dir)*3,vz=Math.sin(dir)*3;
   const s=a.mesh.userData.animal,track=[];
   a.vx=vx;a.vz=vz;
   for(let frame=0;frame<90;frame++){
     animateAnimal(a,1/60);a.mesh.updateMatrixWorld(true);
     assert.equal(a.facing,0);
     for(const side of ['L','R']){
       const shin=s.bones.get('LowerLeg'+side),foot=s.bones.get('Foot'+side);
       const end=shin.localToWorld(s.feet.get(side).ankle.clone());
       assert(end.distanceTo(foot.getWorldPosition(new T.Vector3()))<1e-6,'foot stays attached '+index);
       assert([...shin.quaternion.toArray(),...foot.position.toArray()].every(Number.isFinite));
     }
     if(frame>30)track.push(a.mesh.worldToLocal(s.bones.get('FootL').getWorldPosition(new T.Vector3())).toArray());
   }
   assert(s.grabWeight>.99&&s.strideWeight>.99,'hands and legs animate together');
   assert(Math.sign(s.strideForward)===Math.sign(Math.cos(dir))||Math.abs(Math.cos(dir))<.001);
   assert(Math.sign(s.strideSide)===Math.sign(Math.sin(dir))||Math.abs(Math.sin(dir))<.001);
   tracks.push(track);
   move(a,1/60,{x:Math.cos(dir),z:Math.sin(dir),jump:false});assert.equal(a.facing,0);
   a.ground=null;animateAnimal(a,1/60);assert.equal(s.action,'Jump_Idle');
   releaseGrab(a,players);move(a,1/60,{x:0,z:1,jump:false});assert(a.facing>0,'release restores turning');
 }
 const span=(track,axis)=>Math.max(...track.map(p=>p[axis]))-Math.min(...track.map(p=>p[axis]));
 assert(span(tracks[0],0)>.12&&span(tracks[4],0)>.12,'forward/back footsteps');
 assert(span(tracks[2],2)>.12&&span(tracks[6],2)>.12,'left/right footsteps');
 // Knockdown during a strafe still keeps the mesh and ankle links intact.
 pose(a,-20);pose(b,-18.9);startGrab(a,players);a.vz=3;
 for(let i=0;i<20;i++)animateAnimal(a,1/60);
 knockDown(a);updateGrabs(players,1/60);
 for(let i=0;i<120;i++){move(a,1/60,idle);updateCombat(players,1/60);animateAnimal(a,1/60);}
 assert(a.alive&&a.ragdoll);assert.equal(b.grabbedBy,null);
 assert([...a.mesh.userData.animal.bones.values()].every(b=>b.position.toArray().every(Number.isFinite)));
 console.log('PASS: persistent grabs at 30/60/120 fps, single jump escape/push, AI parity, wall contact, facing lock, eight-way IK footsteps and ragdoll handoff');
`);
