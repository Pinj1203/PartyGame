import {run} from './harness.mjs';
run(`
 const idle={x:0,z:0,jump:false,jumpHeld:false},held={...idle,jump:true,jumpHeld:true};
 function setup(){clean();const floor=addSurface('platform',0,0,0,0,60,50,true);resetPlayers(1);phase='race';practiceMode=true;return {p:players[0],floor};}
 function pose(p,floor,props={}){resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:0,y:.0002,z:0,vx:0,vy:0,vz:0,ground:floor,jumpCD:0,alive:true,finished:false,...props});}
 for(const fps of [30,60,120]){
  const {p,floor}=setup(),dt=1/fps;pose(p,floor);
  let jumps=0,previous=0,firstApex=0;
  for(let i=0;i<fps*4;i++){
   move(p,dt,held);if(previous<=0&&p.vy>0)jumps++;
   if(jumps===1)firstApex=Math.max(firstApex,p.y);
   assert(!p.ground,'holding jump has no grounded waiting frame at '+fps+' FPS');previous=p.vy;
  }
  assert(jumps>=4&&jumps<=5&&firstApex>1.9,'held input repeats full-height jumps, not rapid micro-jumps');
  for(let i=0;i<fps*2;i++)move(p,dt,idle);
  assert(p.ground===floor&&p.vy===0,'release stops automatic repeats after landing');
  pose(p,floor,{ground:null,y:.02,vy:-3,jumpCD:.3});
  move(p,dt,{...idle,jumpPressed:true});
  assert(!p.ground&&p.vy>7&&p.vy<8.5&&p.jumpBuffer===0,'a tap on the landing frame overrides the old flight cooldown and starts a short jump');
  for(let i=0;i<fps*2;i++)move(p,dt,idle);
  assert(p.ground===floor,'one tap is consumed once');
  pose(p,floor,{ground:null,y:.25,vy:-3});move(p,dt,{...idle,jumpPressed:true});
  let buffered=false;
  for(let i=0;i<Math.ceil(fps*.2);i++){move(p,dt,idle);if(p.vy>7){buffered=true;break;}}
  assert(buffered,'a press shortly before landing is retained at '+fps+' FPS');
  pose(p,floor,{ground:null,y:2,vy:-2});move(p,dt,{...idle,jumpPressed:true});
  for(let i=0;i<fps;i++){move(p,dt,idle);assert(p.vy<=0,'expired early presses never cause a delayed surprise jump');}
  pose(p,floor);move(p,dt,held);const vy=p.vy;move(p,dt,idle);move(p,dt,{...held,jumpPressed:true});
  assert(p.vy<vy,'airborne presses cannot double-jump');
  pose(p,floor,{ground:null,y:.02,vy:-19});move(p,dt,held);
  assert(isDown(p)&&p.ragdoll.active,'held jump cannot bypass a heavy-fall knockdown');
  pose(p,floor,{diveRecovery:.25,divePose:1,diveUsed:true});move(p,dt,held);
  assert(isDiving(p)&&p.vy<=0,'dive recovery still blocks jumping');
  pose(p,floor,{grabbedBy:1});move(p,dt,held);assert(p.ground&&p.vy===0,'auto-jump does not bypass an active grab');
  pose(p,floor,{jumpBuffer:.1});clearMouseInput();assert.equal(p.jumpBuffer,0,'blur/menu release clears queued jumps');
  // No direction clears the old momentum, including buffered taps.
  for(const request of [held,{...idle,jumpPressed:true},{...idle,jumpHeld:true}]){
   pose(p,floor,{ground:null,y:.02,vy:-3,vx:6,vz:-3,jumpBuffer:request.jumpHeld&&!request.jump?.09:0});
   move(p,dt,request);
   assert(!p.ground&&p.vy>7,'rebound stays seamless');
   assert(Math.abs(p.vx)<1e-6&&Math.abs(p.vz)<1e-6,'no-input landing rebound clears both velocity components at '+fps+' FPS');
   move(p,dt,idle);
   assert(Math.abs(p.vx)<1e-6&&Math.abs(p.vz)<1e-6,'old momentum does not return after a vertical rebound');
  }
  for(const direction of [{x:1,z:0},{x:0,z:1},{x:-1,z:0},{x:Math.SQRT1_2,z:Math.SQRT1_2}])for(const frozen of [false,true]){
   floor.frozen=frozen;
   const initial={ground:null,y:.02,vy:-3,vx:3,vz:-1};
   for(const request of [held,{...idle,jumpPressed:true},{...idle,jumpHeld:true}]){
    pose(p,floor,{...initial,jumpBuffer:request.jumpHeld&&!request.jump?.09:0});move(p,dt,{...request,...direction});
    assert(!p.ground&&p.vy>7,'directional push still launches in the landing frame');
    assert(Math.abs(p.vx-direction.x*3.5)<1e-6&&Math.abs(p.vz-direction.z*3.5)<1e-6,'landing jump replaces both horizontal velocities with the requested direction at '+fps+' FPS');
    assert(Math.abs(-direction.z*p.vx+direction.x*p.vz)<1e-6,'no previous sideways momentum remains');
    const vx=p.vx,vz=p.vz;move(p,dt,idle);
    assert(Math.abs(p.vx-vx)<1e-6&&Math.abs(p.vz-vz)<1e-6,'extra push is applied only once per real landing');
   }
   floor.frozen=false;
  }
  pose(p,floor,{vx:7});move(p,dt,{...held,x:1});
  assert(Math.abs(p.vx-6.16)<1e-6,'ordinary first jump retains its existing takeoff speed');
  pose(p,floor,{ground:null,y:.02,vy:-3,vx:6});move(p,dt,{...held,x:-1});
  assert(Math.abs(p.vx+3.5)<1e-6&&Math.abs(p.vz)<1e-6,'opposite input immediately launches in the new direction');

 }
 const {p,floor}=setup();const pad=addSurface('bounce',10,0,2);pose(p,pad,{x:10,y:walkY(pad)+.01,ground:null,vy:-3});move(p,1/60,held);
 assert.equal(p.vy,14,'trampoline launch keeps priority over held normal jumping');
 for(const type of ['movingHorizontal','movingVertical']){
  movers=new MovingPlatforms({updateSolidBounds,collision:collisionWorld,players:()=>players});const disk=addSurface(type,20,0,4);movers.pose(1);
  pose(p,disk,{x:disk.x,y:disk.y+.01,ground:null,vy:-3,vx:6,vz:-3});const carry=disk.motionVelocity.clone();move(p,1/60,held);
  assert(Math.abs(p.vx-carry.x)<1e-6&&Math.abs(p.vz-carry.z)<1e-6,'previous flight momentum is cleared before fresh platform carry is inherited');
  assert(!p.ground&&p.launchSurface===disk&&p.vy>=JUMP.speed,'landing rebound inherits the moving support');
  if(type==='movingHorizontal')assert(p.vx>.5);else assert(p.vy>JUMP.speed);
 }
 // Rebounds always use the new direction, including high-speed previous flights,
 // diagonal/repeated inputs and the slower movement of a player holding a grab.
 const runner={vx:0,vz:0};
 for(let i=0;i<240;i++){
  const angle=i*.73;beginJump(runner,{x:Math.cos(angle),z:Math.sin(angle)});
  assert(Math.abs(runner.vx-Math.cos(angle)*3.5)<1e-6&&Math.abs(runner.vz-Math.sin(angle)*3.5)<1e-6,'repeated rebounds follow only the current direction at the same speed');
 }
 const fast={vx:12,vz:2};beginJump(fast,{x:1,z:0});assert.equal(fast.vx,3.5);assert.equal(fast.vz,0);
 const diagonal={vx:0,vz:0};beginJump(diagonal,{x:1,z:1});assert(Math.abs(Math.hypot(diagonal.vx,diagonal.vz)-3.5)<1e-6,'diagonal input has the same push strength');
 const slowed={vx:0,vz:0};beginJump(slowed,{x:1,z:0},COMBAT.grabMoveScale);assert(Math.abs(slowed.vx-3.5*COMBAT.grabMoveScale)<1e-6,'grab movement limits also scale rebound assistance');
 setup();const host=localPlayer(),base=surfaces[0];pose(host,base,{ground:null,y:.02,vy:-3,vx:6,vz:-3,jumpBuffer:.09,jumpCD:.2});
 const packet={...networkSnapshot(),match:1,seq:1},encoder=new netcode.SnapshotEncoder(),decoder=new netcode.SnapshotDecoder();
 const received=decoder.decode(JSON.parse(JSON.stringify(encoder.encode(packet)))).players[0];
 assert.equal(received.jumpBuffer,.09,'pending landing tap survives compact snapshots');
 const predicted=makePredictedActor(received);predictStep(predicted,{...idle,z:1,grab:false,actions:{jump:0,dive:0,punch:0}},1/60,1/60);move(host,1/60,{...idle,z:1});
 assert(predicted.vy>7&&Math.abs(predicted.vy-host.vy)<.001,'guest and host consume the same buffered landing tap');
 assert(Math.abs(host.vx)<1e-6&&Math.abs(host.vz-3.5)<1e-6&&Math.abs(predicted.vx-host.vx)<.001&&Math.abs(predicted.vz-host.vz)<.001,'host and guest clear old momentum and use the same new-direction velocity');
 pose(host,base);host.netActions={jump:0,dive:0,punch:0};const guest=makePredictedActor(networkSnapshot().players[0]);
 for(let i=1;i<=240;i++){
  const command={...held,x:i<120?1:-1,grab:false,actions:{jump:1,dive:0,punch:0}};
  move(host,1/60,applyNetworkCommand(host,command));predictStep(guest,command,1/60,i/60);
  assert(Math.abs(host.y-guest.y)<.001&&Math.abs(host.vy-guest.vy)<.001&&Math.abs(host.x-guest.x)<.001&&Math.abs(host.vx-guest.vx)<.001,'held network inputs and directional rebound impulses repeat identically without new action serials');
 }
 console.log('PASS: cleared landing momentum, input-directed rebound velocity, seamless held jumps, landing-frame and buffered taps, expiration, short/long heights, cooldown reset, action guards, trampolines, moving supports and host/guest parity');
`);
