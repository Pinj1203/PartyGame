import {run} from './harness.mjs';
run(`
 const idle={x:0,z:0,jump:false,jumpHeld:false};
 function setup(){
  clean();const floor=addSurface('platform',0,0,0,0,4,4,true);resetPlayers(6);phase='race';practiceMode=true;
  const p=players[0];players.forEach(q=>q.alive=q===p);
  return {floor,p};
 }
 function pose(p,props={}){resetCombat(p);Object.assign(p,{x:0,y:.06,z:0,vx:0,vy:0,vz:0,ground:null,jumpCD:0,alive:true,finished:false},props);}
 for(const fps of [30,60,120]){
  const {floor,p}=setup(),dt=1/fps;
  // The foot still touches the top corner while the capsule is sliding off it.
  // Its radial contact normal is too steep for the standing-ground criterion.
  pose(p,{x:2.33,y:-.16,vy:-.5});move(p,dt,idle);
  assert.equal(p.ground,null,'fixture is sliding at the lip, not standing on top');
  const encoder=new netcode.SnapshotEncoder(),decoder=new netcode.SnapshotDecoder();
  const packet={...networkSnapshot(),match:1,seq:1};
  const received=decoder.decode(JSON.parse(JSON.stringify(encoder.encode(packet)))).players[0];
  assert(received.jumpGrace>0&&received.jumpSupport===floor.id,'edge allowance survives compact snapshot encoding');
  const predicted=makePredictedActor(received);
  predictStep(predicted,{x:0,z:0,jump:true,grab:false,actions:{jump:1,dive:0,punch:0}},dt,dt);
  assert(predicted.vy>8,'guest predicts the same edge jump before the next host packet');
  const y=p.y;move(p,dt,{...idle,jump:true,jumpHeld:true});
  assert(p.vy>8&&p.y>y,'partial foot contact still permits jumping at '+fps+' FPS');
  assert(Math.abs(predicted.y-p.y)<.005,'predicted edge jump agrees with authority');
  const vy=p.vy;move(p,dt,idle);move(p,dt,{...idle,jump:true,jumpHeld:true});
  assert(p.vy<vy,'edge jump is consumed once, not a double jump');
  // Ordinary wall/underside contacts must never become jump support.
  pose(p,{x:2.34,y:-1,vy:-.5});move(p,dt,idle);move(p,dt,{...idle,jump:true,jumpHeld:true});
  assert(p.vy<=0,'touching a side wall cannot wall-jump');
  pose(p,{x:8,y:-1,vy:-1});move(p,dt,{...idle,jump:true,jumpHeld:true});assert(p.vy<0,'no jump without recent real support');
  // A short walk-off grace interval, including ice, does not extend indefinitely.
  for(const iced of [false,true]){
   if(iced)freezeSurface(floor);
   pose(p,{x:1.8,y:.061,vx:7,ground:floor});
   for(let i=0;i<fps&&p.ground;i++)move(p,dt,{...idle,x:1});
   assert(!p.ground);move(p,dt,{...idle,x:1,jump:true,jumpHeld:true});assert(p.vy>8,'walk-off/ice jump is accepted');
   pose(p,{x:1.8,y:.061,vx:7,ground:floor});
   for(let i=0;i<fps&&p.ground;i++)move(p,dt,{...idle,x:1});
   for(let i=0;i<Math.ceil(fps*.35);i++)move(p,dt,{...idle,x:1});
   move(p,dt,{...idle,x:1,jump:true,jumpHeld:true});assert(p.vy<0,'grace expires after leaving the edge');
  }
  const pad=addSurface('bounce',10,0,1);
  pose(p,{x:10,y:walkY(pad)+.8,vy:-3,diving:true,diveUsed:true,divePose:1,diveYaw:0});
  let bounced=false;
  for(let i=0;i<fps;i++){move(p,dt,idle);if(p.launchSurface===pad&&p.vy>10){bounced=true;break;}}
  assert(bounced,'a diving body contacts the actual trampoline at '+fps+' FPS');
  assert(!isDiving(p)&&p.divePose===0&&!p.diveUsed,'trampoline counts as landing and restores standing controls');
  animateAnimal(p,dt);assert(Math.abs(p.mesh.userData.animal.bodyPivot.rotation.z)<.4,'rendered body is upright after the bounce');
  const bouncedPrediction=makePredictedActor(networkSnapshot().players[0]);
  predictStep(bouncedPrediction,{x:0,z:0,jump:false,grab:false,actions:{jump:0,dive:0,punch:0}},dt,dt);
  assert(!isDiving(bouncedPrediction)&&bouncedPrediction.divePose===0,'guest keeps the upright bounce instead of re-entering dive');
  move(p,dt,idle);assert(!isDiving(p)&&p.divePose===0,'next airborne frame must not restore the dive');
  assert(startPunch(p),'standing trampoline launch restores upper-body actions');
  assert(startDive(p),'a new trampoline flight allows one new dive');assert(!startDive(p),'second dive in the same flight is blocked');
 }
 for(const type of ['movingHorizontal','movingVertical']){
  const {p}=setup();movers=new MovingPlatforms({updateSolidBounds,collision:collisionWorld,players:()=>players});
  const disk=addSurface(type,30,0,3);movers.pose(1);
  pose(p,{x:disk.x+2.71,y:disk.y-.2,z:disk.z,vy:-.5});move(p,1/60,idle);
  assert(!p.ground&&p.jumpSupport===disk.id,'round moving disk lip supports a jump');
  move(p,1/60,{...idle,jump:true,jumpHeld:true});
  assert.equal(p.launchSurface,disk);assert(p.vy>8,'round platform edge jump works');
  if(type==='movingHorizontal')assert(p.vx>.5,'edge jump inherits horizontal platform velocity');
  else assert(p.vy>JUMP.speed,'edge jump inherits vertical platform velocity');
 }
 console.log('PASS: sliding ledge/ice jumps, no wall or double jumps, expiring grace, standing trampoline launches and renewed dive availability at 30/60/120 FPS');
`);
