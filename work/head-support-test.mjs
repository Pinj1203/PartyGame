import {run} from './harness.mjs';
run(`
 const idle={x:0,z:0,jump:false};
 function setup(angle,x=0,type='platform'){
  clean();movers=new MovingPlatforms({updateSolidBounds,collision:collisionWorld,players:()=>players});
  const floor=type==='platform'?addSurface('platform',0,0,0,0,4,8,true):addSurface(type,0,0,0);
  resetPlayers(1);phase='race';practiceMode=true;
  const p=players[0];resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:0,y:0,z:0,vx:0,vz:0,vy:0,ground:null});p.impactSpin=0;knockDown(p);
  const r=p.ragdoll,head=r.nodes.get('Head'),pivot=head.p.clone(),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle);
  const target=new T.Vector3(x,x?.06+Math.sqrt(head.radius**2-(x-2)**2):.6,0);
  // Rotate the intact physical skeleton, never move individual bones apart.
  for(const n of r.nodes.values()){n.p.sub(pivot).applyQuaternion(q).add(target);n.prev.copy(n.p);n.velocity.set(0,0,0);}
  r.core.center.sub(pivot).applyQuaternion(q).add(target);r.core.rotation.copy(q);
  const body=r.nodes.get('Body');p.x=body.p.x;p.y=body.p.y-.25;p.z=body.p.z;
  return {p,r,floor};
 }
 for(const fps of [30,60,120]){
  for(const [angle,x] of [[Math.PI,0],[Math.PI/2,0],[Math.PI/4,2.2],[Math.PI/4,2.25]]){
   const {p,r,floor}=setup(angle,x);let hangingContact=false,earOnlyContact=false;
   for(let i=0;i<fps*6&&isDown(p)&&p.alive;i++){
    move(p,1/fps,idle);
    if(r.active&&r.support){
     hangingContact ||= p.y<r.support.point.y-.5;
     const names=[...r.nodes.values()].filter(n=>collisionWorld.sphereSupport(n.p,n.radius)).map(n=>n.name);
     earOnlyContact ||= names.length>0&&names.every(name=>name.startsWith('Ear'));
    }
    updateCombat(players,1/fps);
   }
   assert(p.alive&&!isDown(p)&&!r.active&&p.ground===floor,'head/ear-supported body recovers at '+fps+' FPS, angle='+angle+', x='+x);
   if(x)assert(hangingContact,'test covers pelvis below the supporting platform');
   if(angle===Math.PI)assert(earOnlyContact,'inverted fixture covers support exclusively through the ears');
   assert(Math.abs(p.y-floorAt(floor,p.x,p.z))<.01,'recovery uses an actual clear standing position');
  }
  for(const type of ['movingHorizontal','movingVertical']){
   const {p,r,floor}=setup(Math.PI,0,type);
   for(let i=1;i<=fps*6&&isDown(p)&&p.alive;i++){
    const old=r.active?r.support?.point.clone():null,before=new T.Vector3(floor.x,floor.y,floor.z),carried=p.ground===floor;
    movers.pose(i/fps,true);
    if(old&&carried)assert(r.support.point.distanceTo(old.add(new T.Vector3(floor.x,floor.y,floor.z).sub(before)))<1e-8,'support anchor follows its moving platform');
    move(p,1/fps,idle);updateCombat(players,1/fps);
   }
   assert(p.alive&&!isDown(p)&&p.ground===floor,'upside-down riders recover on '+type+' at '+fps+' FPS');
  }
 }
 const {p}=setup(Math.PI);
 assert(!collisionWorld.sphereSupport(new T.Vector3(2.2,-.3,0),.27),'vertical side contact is not ground');
 assert(!collisionWorld.sphereSupport(new T.Vector3(0,-1.5,0),.27),'platform undersides are not ground');
 assert(!collisionWorld.sphereSupport(new T.Vector3(0,3,0),.27),'nearby geometry cannot grant airborne recovery');
 // Removing real support immediately pauses recovery instead of retaining it.
 stepRagdoll(p,1/60,collisionWorld);collisionWorld.clear();
 const timer=p.downTime;for(let i=0;i<12;i++){move(p,1/120,idle);updateCombat(players,1/120);}
 assert(!p.ground&&p.downTime===timer,'unsupported ragdolls keep waiting for landing');
 console.log('PASS: inverted head/ear support, hanging-pelvis recovery, real standing clearance, moving-platform anchors, no wall/underside/air recovery at 30/60/120 FPS');
`);
