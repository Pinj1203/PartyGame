import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,180,80,true);resetPlayers(6);phase='race';expert=true;
 const a=players[0],b=players[1],c=players[2],idle={x:0,z:0,jump:false},walking={x:1,z:0,jump:false};
 function pose(p,x=0){
   releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);
   Object.assign(p,{x,z:0,y:0,vx:0,vz:0,vy:0,ground:floor,alive:true,finished:false,facing:0,jumpCD:0});
   p.mesh.position.set(x,0,0);p.mesh.rotation.set(0,0,0);
 }
 players.forEach((p,i)=>pose(p,50+i*3));
 // Half a second of continuous intent, independent of frame rate or motion from a tether.
 for(const fps of [30,60,120]){
   pose(a);pose(b,1.1);startGrab(a,players);
   b.impulseX=3;
   for(let i=0;i<fps;i++){recordGrabInput(b,idle);updateGrabs(players,1/fps);}
   assert.equal(a.grabbing,b.i,'passive movement cannot escape');
   for(let i=0;i<fps/2-1;i++){
     recordGrabInput(b,walking);updateGrabs(players,1/fps);
     assert.equal(a.grabbing,b.i,'no early movement escape');
   }
   recordGrabInput(b,idle);updateGrabs(players,1/fps);
   assert.equal(b.escapeProgress,0,'interruption resets progress');
   for(let i=0;i<fps/2;i++){recordGrabInput(b,walking);updateGrabs(players,1/fps);}
   assert.equal(b.grabbedBy,null,'escapes at 0.5 seconds');
   assert(b.ground===floor&&b.vy===0,'movement escape does not auto-jump');
   assert(a.grabNeedsRelease&&b.grabImmunity===1);
 }
 // Speeds settle to 35%/42% of free movement; both use the same controller.
 pose(a,-10);pose(b,-8.9);pose(c,10);startGrab(a,players);
 for(let i=0;i<24;i++){
   recordGrabInput(a,walking);recordGrabInput(b,walking);updateGrabs(players,1/60);
   move(a,1/60,walking);move(b,1/60,walking);move(c,1/60,walking);
 }
 assert(a.grabbing===b.i&&a.vx<b.vx&&b.vx<c.vx);
 assert(Math.abs(a.vx/c.vx-.35)<.01&&Math.abs(b.vx/c.vx-.42)<.01,'configured slower speeds');
 // Foot cadence slows for both roles, with the victim slightly faster.
 pose(a,-10);pose(b,-8.9);startGrab(a,players);a.vx=b.vx=2.5;
 const strides=[0,0];
 for(let i=0;i<40;i++)for(const [index,p] of [a,b].entries()){
   const s=p.mesh.userData.animal,before=s.stridePhase;animateAnimal(p,1/60);
   strides[index]+=(s.stridePhase-before+Math.PI*2)%(Math.PI*2);
   p.mesh.updateMatrixWorld(true);
   for(const side of ['L','R']){
     const foot=s.bones.get('Foot'+side),shin=s.bones.get('LowerLeg'+side);
     assert(foot.getWorldPosition(new T.Vector3()).distanceTo(shin.localToWorld(s.feet.get(side).ankle.clone()))<1e-6);
   }
 }
 assert(Math.abs(strides[1]/strides[0]-1.2)<.001,'victim footsteps 20% faster than holder');
 assert(a.mesh.userData.animal.grabWeight>.99,'slow footsteps retain the holding layer');
 // Jump escape has a lower actual apex than an ordinary jump, without changing normal jumps.
 pose(a);pose(b,1.1);startGrab(a,players);strugglePulse(b);updateGrabs(players,1/60);
 assert.equal(b.vy,8.2);let escapeApex=0;
 for(let i=0;i<80;i++){move(b,1/120,idle);escapeApex=Math.max(escapeApex,b.y);}
 pose(c,10);move(c,1/120,{...idle,jump:true});let normalApex=0;
 for(let i=0;i<100;i++){move(c,1/120,idle);normalApex=Math.max(normalApex,c.y);}
 assert(escapeApex>1.2&&escapeApex<1.6&&normalApex>2);
 assert(escapeApex/normalApex>.65&&escapeApex/normalApex<.75);
 // Neither sustained input nor jump presses accumulate through knockdown/get-up.
 pose(a);pose(b,1.1);knockDown(b);startGrab(a,players);
 for(let i=0;i<90;i++){recordGrabInput(b,walking);strugglePulse(b);updateGrabs(players,1/60);}
 assert.equal(b.escapeProgress,0);assert(!b.escapeJumpRequested&&a.grabbing===b.i);
 b.downTime=0;b.getUpTime=.2;
 for(let i=0;i<30;i++){recordGrabInput(b,walking);updateGrabs(players,1/60);}
 assert.equal(b.escapeProgress,0);b.getUpTime=0;
 recordGrabInput(b,idle);updateGrabs(players,1/60);assert.equal(a.grabbing,b.i);
 // Real frame loop reads current keys: releasing just before 0.5 s cancels immediately.
 players.forEach((p,i)=>pose(p,50+i*3));pose(a);pose(b,-1.1);startGrab(b,players);
 practiceMode=true;remaining=999;raceTime=0;keys={KeyW:true};
 for(let i=0;i<29;i++)tick(last+1000/60);
 assert.equal(a.grabbedBy,b.i);assert(a.escapeProgress>.95);
 keys={};tick(last+1000/60);assert.equal(a.escapeProgress,0,'no stale input on key release frame');
 keys={KeyW:true};for(let i=0;i<30;i++)tick(last+1000/60);
 assert.equal(a.grabbedBy,null);
 assert($('status').textContent.includes('掙脫成功'));
 console.log('PASS: lower escape jump apex, 35%/42% movement, slower paired footsteps, exact continuous 0.5 s escape at 30/60/120 fps, current-frame release and downed protection');
`);
