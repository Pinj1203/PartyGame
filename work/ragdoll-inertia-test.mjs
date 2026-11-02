import {run} from './harness.mjs';
run(`
 const emptyWorld=new CollisionWorld();
 function warm(fps,turning=false){
  clean();resetPlayers(2);phase='race';
  const actors=players.slice(0,2),dt=1/fps;
  for(const p of actors){resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:p.i*5,y:20,z:0,vx:turning?0:7,vy:3,vz:0,ground:{},alive:true,finished:false});}
  for(let frame=0;frame<Math.round(fps*.6);frame++)for(const p of actors){
   p.facing=turning?frame*dt*3:0;p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=-p.facing;animateAnimal(p,dt);
  }
  for(const p of actors)p.ground=null;
  return actors;
 }
 function relative(p,name){const r=p.ragdoll;return r.nodes.get(name).p.clone().sub(r.core.center).applyQuaternion(r.core.rotation.clone().invert());}
 for(const fps of [30,60,120])for(const turning of [false,true]){
  const [p,control]=warm(fps,turning),rig=p.mesh.userData.animal;
  const sampled=rig.ragdollMotion;
  assert(sampled?.ready,'actual character animation supplies pose motion');
  control.mesh.userData.animal.ragdollMotion=null;
  knockDown(p);knockDown(control);
  const centerVelocity=p.ragdoll.core.nodes.reduce((sum,n)=>sum.add(n.velocity),new T.Vector3()).divideScalar(p.ragdoll.core.nodes.length);
  assert(centerVelocity.distanceTo(new T.Vector3(turning?0:7,3,0))<1e-9,'pose inertia adds no hidden linear launch');
  const start=relative(p,'FistL'),baseStart=relative(control,'FistL'),rotation=p.ragdoll.core.rotation.clone();
  const mixerTime=rig.mixer.time;let swing=0,baseSwing=0,turn=0;
  for(let i=0;i<Math.round(fps*.5);i++){
   for(const actor of [p,control]){stepRagdoll(actor,1/fps,emptyWorld);actor.mesh.position.set(actor.x,actor.y,actor.z);animateAnimal(actor,1/fps);}
   swing=Math.max(swing,relative(p,'FistL').distanceTo(start));baseSwing=Math.max(baseSwing,relative(control,'FistL').distanceTo(baseStart));turn=Math.max(turn,p.ragdoll.core.rotation.angleTo(rotation));
   assert(p.ragdoll.contacts===0&&!p.ground,'inertial motion is measured without external collision');
   for(const node of p.ragdoll.nodes.values())assert(Number.isFinite(node.p.x)&&node.velocity.length()<25,'inherited inertia stays stable');
   for(const bind of p.ragdoll.binds){
    if(bind.bone.name!=='Root'&&!bind.bone.name.startsWith('Foot'))assert(bind.bone.position.distanceTo(bind.position)<1e-8,'inertia never stretches a bone');
    assert(bind.bone.scale.distanceTo(bind.scale)<1e-8,'inertia never changes body scale');
   }
  }
  assert.equal(rig.mixer.time,mixerTime,'animation playback is stopped throughout ragdoll');
  assert(turning?turn>.2:swing>baseSwing+.04,'limbs/core keep moving from inherited animation inertia');
 }
 // Respawn, teleports, pauses and lobby animation cannot seed stale impulses.
 for(const reset of ['teleport','rotation','pause','reset','lobby']){
  const [p]=warm(60,true),rig=p.mesh.userData.animal;
  if(reset==='teleport')p.x+=30;
  if(reset==='rotation')p.facing+=Math.PI;
  if(reset==='pause')animateAnimal(p,.2);
  if(reset==='reset')resetAnimal(p.mesh);
  if(reset==='lobby')animateAnimal(p,1/60,true);
  knockDown(p);
  assert([...p.ragdoll.nodes.values()].every(n=>n.velocity.distanceTo(new T.Vector3(0,3,0))<1e-9),'no stale angular motion after '+reset);
 }
 console.log('PASS: inherited run/turn inertia without external collision, preserved body momentum, no animation during ragdoll and clean reset at 30/60/120 FPS');
`);
