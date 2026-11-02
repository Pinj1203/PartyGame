import {run} from './harness.mjs';
run(`
 const idle={x:0,z:0,jump:false};
 function setup(){clean();resetPlayers(6);phase='race';practiceMode=true;const p=players[0];players.forEach(q=>q.alive=q===p);return p;}
 function pose(p,position,ground=null){resetCombat(p);Object.assign(p,{x:position.x,y:position.y,z:position.z,vx:0,vy:0,vz:0,ground,jumpCD:0,alive:true,finished:false});}
 for(const fps of [30,60,120]){
  for(const angle of [0,Math.PI/4])for(const edge of [[2.25,0],[2.2,2.2]]){
   const p=setup(),floor=addSurface('platform',0,0,0,angle,4,4,true);
   const start=floor.mesh.localToWorld(new T.Vector3(edge[0],.0602,edge[1]));pose(p,start,floor);
   for(let i=0;i<fps*2;i++)move(p,1/fps,idle);
   assert(p.ground===floor,'a supported hard edge remains grounded at '+fps+' FPS');
   assert(Math.hypot(p.x-start.x,p.z-start.z)<.003&&Math.abs(p.y-start.y)<.003,'gravity cannot manufacture sideways movement at a flat edge');
   const prediction=makePredictedActor(networkSnapshot().players[0]);
   predictStep(prediction,{...idle,grab:false,actions:{jump:0,dive:0,punch:0}},1/60,1/60);
   assert(Math.hypot(prediction.x-p.x,prediction.z-p.z)<.003,'guest prediction uses the same stable edge');
   move(p,1/fps,{...idle,jump:true,jumpHeld:true});assert(p.vy>8,'jumping remains available on the lip');
   pose(p,start,floor);freezeSurface(floor);
   for(let i=0;i<fps;i++)move(p,1/fps,idle);
   assert(Math.hypot(p.x-start.x,p.z-start.z)<.003,'idle ice edge does not create gravity-driven sideways speed');
   const direction=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),angle);
   for(let i=0;i<fps/2;i++)move(p,1/fps,{...idle,x:direction.x,z:direction.z});
   assert(!p.ground&&p.y<start.y-.1,'walking beyond real foot support still falls');
  }
  const p=setup(),wall=addSurface('platform',0,0,0,0,4,4,true);
  pose(p,new T.Vector3(2.4,.0602,0));for(let i=0;i<fps/2;i++)move(p,1/fps,idle);
  assert(!p.ground&&p.y<-.5,'no invisible floor outside the foot footprint');
  pose(p,new T.Vector3(2.25,-.3,0));move(p,1/fps,idle);
  assert(p.y<-.2,'side contact from below is not snapped onto the top');
  const slope=addSurface('platform',30,0,20,0,16,20,true);slope.mesh.rotation.z=70*Math.PI/180;updateSolidBounds(slope);
  const normal=new T.Vector3(-Math.sin(70*Math.PI/180),Math.cos(70*Math.PI/180),0);
  const start=slope.mesh.localToWorld(new T.Vector3(0,0,0)).addScaledVector(normal,.3601).add(new T.Vector3(0,-.36,0));pose(p,start);
  for(let i=0;i<fps/2;i++)move(p,1/fps,idle);
  assert(!p.ground&&p.y<start.y-.3&&p.x<start.x-.1,'a real 70-degree slope still slides');
 }
 for(const type of ['movingHorizontal','movingVertical']){
  const p=setup();movers=new MovingPlatforms({updateSolidBounds,collision:collisionWorld,players:()=>players});
  const disk=addSurface(type,10,0,4);pose(p,new T.Vector3(disk.x+2.65,disk.y+.0002,disk.z),disk);
  for(let i=1;i<=180;i++){movers.pose(i/60,true);move(p,1/60,idle);}
  assert(p.ground===disk,'circular moving edge keeps its passenger');
  assert(Math.abs(p.x-disk.x-2.65)<.005&&Math.abs(p.y-disk.y)<.005,'passenger remains stable relative to moving disk');
 }
 console.log('PASS: stable flat edges/corners, rotated and icy platforms, edge jumping, real 70-degree sliding, no wall climbing/invisible floors, moving disks and prediction');
`);
