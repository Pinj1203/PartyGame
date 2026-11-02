import {run} from './harness.mjs';
run(`
 const idle={x:0,z:0,jump:false};
 for(const fps of [30,60,120]){
  clean();const floor=addSurface('platform',10,0,0,0,40,40,true);resetPlayers(6);phase='race';practiceMode=false;
  const p=players[0];players.forEach(q=>q.alive=q===p);
  function pose(y=.0002){resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:10,y,z:0,vx:0,vy:0,vz:0,ground:y<1?floor:null,alive:true,finished:false});}
  pose();waves=[{x:8,z:0,y:.35,r:2}];move(p,1/fps,idle);
  assert(isDown(p)&&p.ragdoll.active,'a real wave contact immediately enables ragdoll');
  assert([...p.ragdoll.nodes.values()].every(n=>n.velocity.length()<1e-8),'stationary victims receive no linear or hidden spin impulse');
  assert(!p.ragdoll.launching&&p.ground===floor,'grounded victims are not launched');
  assert(waves[0].hitPlayers.has(p.i),'one hit per wave is recorded');
  const serial=p.hitSerial,center=p.ragdoll.core.center.clone();let peak=center.y,lowest=center.y;
  for(let i=0;i<fps*4;i++){
   move(p,1/fps,idle);updateCombat(players,1/fps);animateAnimal(p,1/fps);
   if(p.ragdoll?.active){peak=Math.max(peak,p.ragdoll.core.center.y);lowest=Math.min(lowest,p.ragdoll.core.center.y);}
  }
  assert(peak<center.y+.1,'physical collapse does not throw the body upward');
  assert(lowest<center.y-.2,'the body actually collapses under gravity');
  assert(Math.hypot(p.x-10,p.z)<1,'collapse stays near the hit location');
  assert(!isDown(p)&&p.alive,'normal recovery completes after ground contact');
  assert.equal(p.hitSerial,serial,'the same wave does not knock down a recovered victim again');
  waves=[];
  for(const vy of [9.8,5,0,-3])for(const direction of [1,-1]){
   pose(6);Object.assign(p,{vx:7*direction,vz:-2*direction,vy,impulseX:5*direction,impulseZ:2*direction,grabVelocityX:2*direction,grabVelocityZ:direction});
   assert(hitWave(p));
   const expected=new T.Vector3(14*direction,vy,direction);
   assert([...p.ragdoll.nodes.values()].every(n=>n.velocity.distanceTo(expected)<1e-10),'all body parts inherit movement, jump/fall, knockback and grab velocity without added spin');
   assert(p.impulseX===0&&p.impulseZ===0&&p.grabVelocityX===0&&p.grabVelocityZ===0,'pending movement channels are consumed once');
   assert(!p.ragdoll.settleInPlace,'moving victims do not receive the stationary collapse braking');
   assert.equal(p.ragdoll.launching,vy>.5,'existing upward motion keeps the launch/landing guard');
   const timer=p.downTime;updateCombat(players,.5);assert.equal(p.downTime,timer,'airborne victims still wait for landing to recover');
   const center=p.ragdoll.core.center.clone();move(p,1/fps,idle);
   const travel=p.ragdoll.core.center.clone().sub(center);
   assert(!p.ground&&travel.x*direction>.1&&travel.z*direction>0,'airborne collapse carries on along the previous horizontal direction');
   assert(vy>0?travel.y>0:travel.y<0,'upward jumps keep rising; apex and falling victims follow gravity');
   assert(Math.abs(p.vx)<14.5,'transferred momentum is not added a second time');
  }
  // Reproduce a wave hitting on the actual launch frame, while the feet are near the floor.
  pose();p.vx=7;p.vz=0;waves=[{x:8,z:0,y:.35,r:2.2}];
  move(p,1/fps,{x:1,z:0,jump:true,jumpHeld:true});
  assert(isDown(p)&&p.ragdoll.active&&p.ragdoll.launching,'a wave can knock down a just-launched jumper without cancelling takeoff');
  const jumpVelocity=new T.Vector3(7*JUMP.takeoffScale,JUMP.speed-22/fps,0);
  assert([...p.ragdoll.nodes.values()].every(n=>n.velocity.distanceTo(jumpVelocity)<1e-9),'real wave collision inherits the exact current takeoff velocity');
  const launchCenter=p.ragdoll.core.center.clone(),launchTimer=p.downTime;
  for(let i=0;i<Math.round(fps*.2);i++){move(p,1/fps,idle);updateCombat(players,1/fps);}
  assert(p.ragdoll.core.center.x>launchCenter.x+.8&&p.ragdoll.core.center.y>launchCenter.y+.7,'knocked-down jumper continues forward and upward');
  assert(!p.ground&&p.downTime===launchTimer,'near-floor takeoff does not falsely start recovery');
  waves=[];
  // Grounded movement keeps its velocity before ordinary floor friction acts.
  for(const frozen of [false,true]){
   floor.frozen=frozen;pose();Object.assign(p,{vx:5,vz:3});assert(hitWave(p));
   assert([...p.ragdoll.nodes.values()].every(n=>n.velocity.x===5&&n.velocity.z===3&&n.velocity.y===0),'running wave hit preserves horizontal momentum without lift');
   assert(!p.ragdoll.settleInPlace,'running wave hit uses normal surface friction');
  }
  floor.frozen=false;
  pose();p.hazardCooldown=.5;assert(!hitWave(p)&&!isDown(p),'hazard immunity still applies');
  pose();p.alive=false;assert(!hitWave(p),'eliminated players cannot be hit');
  pose();p.finished=true;assert(!hitWave(p),'finished players cannot be hit');
  pose();assert(hazardImpact(p,1,0,9,5.5));assert(p.ragdoll.nodes.get('Body').velocity.y===5.5,'other hazards retain their launch behavior');
 }
 console.log('PASS: wave knockdowns preserve running/jump/fall/impulse/grab momentum, zero added launch/spin, launch-frame trajectory, normal moving friction, stationary collapse, grounded recovery and immunity at 30/60/120 FPS');
`);
