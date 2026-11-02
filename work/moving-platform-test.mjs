import {run} from './harness.mjs';
run(`
 assert.equal(MOVING.travel,COURSE.length/4);
 $('count').value='6';start();
 assert(selection.some(s=>s.type==='movingHorizontal'));
 beginRound();assert(selection.some(s=>s.type==='movingVertical'));
 for(const type of MOVING_TYPES){
  const a=suggest(type);assert(legal(a,type,0),'legal suggested placement for '+type);
 }
 clean();makeMap(0);resetPlayers(6);phase='build';players[0].pick='movingHorizontal';
 aim={x:20,y:8,z:30};makeGhost();updateGhost();
 assert(ghost.getObjectByName('movement-path'));assert(ghost.getObjectByName('movement-endpoint'));
 assert.equal(ghost.getObjectByName('movement-endpoint').position.x,20);
 assert.match($('coords').textContent,/單程 20m/);
 const anchor={...aim};rotateView(90,30);assert.deepEqual(aim,anchor);assert.equal(ghost.rotation.y,0);
 rotatePlacement();assert.equal(ghost.rotation.y,Math.PI/2);
 const s=addSurface('movingHorizontal',20,30,8,Math.PI/2);
 assert.equal(s.mesh.userData.solids.length,1,'only the disk is solid, never the preview path');
 assert(supportAt(s,20,30));assert.equal(supportAt(s,22,32),null,'disk corners are empty');
 assert(!legal({x:20,y:8,z:20},'platform',0),'entire rotated path reserved');
 assert(legal({x:25,y:8,z:20},'platform',0),'outside the path remains buildable');
 assert(!legal({x:65,y:0,z:30},'movingHorizontal',0),'endpoint stays within build extent');
 assert(!legal({x:20,y:25,z:30},'movingVertical',0),'vertical endpoint obeys height limit');
 const reserved=bounds(s);movers.pose(4);assert.equal(bounds(s),reserved,'placement bounds use immutable origin');
 assert(Math.abs(s.z-20)<1e-8);assert.equal(s.x,20);
 assert(supportAt(s,20,20));assert.equal(supportAt(s,20,30),null,'colliders move with the disk');
 const state=networkSnapshot().surfaces.find(q=>q.id===s.id);assert.deepEqual([state.x,state.y,state.z],[20,8,30],'snapshot sends origin, not current phase');
 freezeSurface(s);movers.pose(8);assert(s.frozen&&s.mesh.userData.solids[0].material.isMeshPhysicalMaterial);
 beginRound();assert.deepEqual([s.x,s.y,s.z],[20,8,30]);assert(s.frozen);

 for(const type of MOVING_TYPES)for(const fps of [30,60,120]){
  clean();makeMap(0);resetPlayers(6);phase='race';practiceMode=false;raceTime=0;
  const platform=addSurface(type,20,30,6),p=players[0];
  players.forEach(q=>q.alive=q===p);resetCombat(p);
  Object.assign(p,{x:20,y:6.002,z:30,vx:0,vy:0,vz:0,ground:platform});
  for(let i=1;i<=fps*16;i++){
   raceTime=i/fps;traps(1/fps);move(p,1/fps,{x:0,z:0,jump:false});
   assert(p.alive&&p.ground===platform,type+' retains rider at '+fps+' FPS / '+raceTime);
   assert(Math.abs(p.x-platform.x)<.01&&Math.abs(p.y-platform.y)<.01&&Math.abs(p.z-platform.z)<.01,'no drift on the full return trip');
  }
  movers.pose(4);Object.assign(p,{x:platform.x,y:platform.y+.002,z:platform.z,vx:0,vy:0,vz:0,ground:platform});
  movers.pose(4+1/fps,true);const velocity=platform.motionVelocity.clone();
  move(p,1/fps,{x:0,z:0,jump:true,jumpHeld:true});assert.equal(p.ground,null);
  if(type==='movingHorizontal')assert(p.vx>3.8,'jump inherits horizontal carrier velocity');
  else assert(Math.abs(p.vy-(JUMP.speed+velocity.y-22/fps))<.01,'jump inherits lift velocity');
 }
 clean();makeMap(0);resetPlayers(6);phase='race';raceTime=0;
 const platform=addSurface('movingHorizontal',20,30,6),p=players[0];
 Object.assign(p,{x:20,y:6.002,z:30,vx:0,vy:0,vz:0,ground:platform});knockDown(p);beginRagdoll(p);
 const node=p.ragdoll.nodes.get('Body'),before=node.p.clone(),previous=node.prev.clone();
 movers.pose(.5,true);const displacement=platform.x-20;
 assert(Math.abs(node.p.x-before.x-displacement)<1e-9);assert(Math.abs(node.prev.x-previous.x-displacement)<1e-9,'ragdoll translation preserves Verlet velocity and body proportions');

 function rideAI(type,startTime=0){
  clean();movers=new MovingPlatforms({updateSolidBounds,collision:collisionWorld,players:()=>players});
  const start=addSurface('platform',0,0,0,0,8,8,true);
  const ferry=addSurface(type,7,0,0);
  const end=type==='movingHorizontal'?addSurface('platform',34,0,0,0,8,8,true):addSurface('platform',14,0,20,0,8,8,true);
  resetPlayers(6);expert=true;phase='race';raceTime=0;practiceMode=false;
  const p=players[1];players.forEach(q=>q.alive=q===p);Object.assign(p,{x:2,y:.002,z:0,vx:0,vz:0,vy:0,ground:start});
  movers.pose(startTime);
  assert(route(start,p).includes(end),'AI finds the timed '+type+' connection');
  let boarded=false,arrived=false;
  for(let i=1;i<=60*40&&p.alive;i++){
   raceTime=startTime+i/60;traps(1/60);move(p,1/60,bot(p,1/60));updateCombat([p],1/60);
   boarded ||= p.ground===ferry;arrived ||= p.ground===end;if(arrived)break;
  }
  assert(boarded,'AI boards '+type);assert(arrived,'AI rides and exits '+type+'; final '+JSON.stringify({x:p.x,y:p.y,z:p.z,ground:p.ground?.id,alive:p.alive,plan:p.plan.map(s=>s.id)}));
 }
 for(const type of MOVING_TYPES){rideAI(type);rideAI(type,8);}
 console.log('PASS: quarter-map paths, circular solids, full-path placement/rotation preview, icy movers, 30/60/120 FPS riders and takeoff, ragdoll carrying, timed AI boarding/riding/exiting');
`);
