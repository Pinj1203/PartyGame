import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,80,80,true);resetPlayers(1);phase='race';practiceMode=false;
 const p=players[0],idle={x:0,z:0,jump:false};
 function pose(values={}){resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:0,y:6,z:0,vx:6,vy:4,vz:-2,impulseX:2,impulseZ:-1,grabVelocityX:1,grabVelocityZ:2,ground:null,alive:true,finished:false,...values});}
 function incoming(){return new T.Vector3(p.vx+p.impulseX+p.grabVelocityX,p.vy,p.vz+p.impulseZ+p.grabVelocityZ);}
 function check(expected,message){
  assert(p.ragdoll?.active&&isDown(p),message+': active ragdoll');
  const mean=p.ragdoll.core.nodes.reduce((sum,n)=>sum.add(n.velocity),new T.Vector3()).divideScalar(p.ragdoll.core.nodes.length);
  assert(mean.distanceTo(expected)<1e-9,message+': core momentum '+mean.toArray()+' expected '+expected.toArray());
  assert(new T.Vector3(p.vx,p.vy,p.vz).distanceTo(expected)<1e-9,message+': exported velocity includes the transferred channels');
  assert(p.impulseX===0&&p.impulseZ===0&&p.grabVelocityX===0&&p.grabVelocityZ===0,message+': no duplicate pending force');
 }
 // Plain knockdowns, including losing support during recovery, never reduce travel.
 pose();let expected=incoming();knockDown(p);check(expected,'plain knockdown');
 assert([...p.ragdoll.nodes.values()].every(n=>n.velocity.distanceTo(expected)<1e-9),'a force-free fall has no invented launch/spin');
 beginRagdoll(p);check(expected,'idempotent ragdoll handoff');
 for(const vy of [9.8,0,-12])for(const hit of [[1,0,8,5.8],[-1,0,10,6.5],[0,1,8,5.8],[3,4,10,6.5]]){
  pose({vy});const before=incoming(),[dx,dz,strength,lift]=hit,length=Math.hypot(dx,dz);
  expected=before.clone().add(new T.Vector3(dx/length*strength,lift,dz/length*strength));
  assert(hazardImpact(p,dx,dz,strength,lift));check(expected,'spike/cannon additive impact');
  assert(!hazardImpact(p,dx,dz,strength,lift),'immunity prevents repeated impulses');check(expected,'repeated hit ignored');
 }
 // The solver supplies TOTAL pre-projection velocity, not only the walk channel.
 pose();const total=incoming(),force=new T.Vector3(-5,2,4);force.impactEnergy=100;
 p.vx=0;p.vz=0;p.vy=0; // Simulate a solid contact already projecting the movement channels.
 assert(mechanicalImpact(p,force,total));check(total.clone().add(force),'physical contact does not lose or double-count incoming momentum');
 pose({vx:0,vy:0,vz:0,impulseX:0,impulseZ:0,grabVelocityX:0,grabVelocityZ:0});
 const soft=new T.Vector3(2,0,0);soft.impactEnergy=2;
 assert(mechanicalImpact(p,soft,new T.Vector3()));assert(!isDown(p),'small impacts retain the existing knockdown threshold');
 assert.equal(p.vx+p.impulseX,2);
 // Captured normals still prevent a very strong impact pushing through a solid.
 pose({vx:-30,vy:3,vz:2,impulseX:0,impulseZ:0,grabVelocityX:0,grabVelocityZ:0});
 const wallNormal=new T.Vector3(1,0,0),wallVelocity=new T.Vector3(),wallIncoming=incoming();
 const wallForce=contactImpulse(wallNormal,wallVelocity,wallIncoming);
 assert(mechanicalImpact(p,wallForce,wallIncoming));
 const wallMean=p.ragdoll.core.nodes.reduce((sum,n)=>sum.add(n.velocity),new T.Vector3()).divideScalar(p.ragdoll.core.nodes.length);
 assert(wallMean.x>=-1e-9,'collision projection prevents residual inward momentum');
 for(const fps of [30,60,120]){
  // A real projectile contact preserves the rise of a jumping target and adds its hit.
  pose({y:.2,vx:3,vy:9.8,vz:1,impulseX:1,impulseZ:0,grabVelocityX:.25,grabVelocityZ:0});
  expected=incoming().add(new T.Vector3(13.5,8.775,0));
  const bullet=sphere(.3,0,world);bullet.position.set(-1,.8,0);const shot={mesh:bullet,dx:CANNON.speed,dz:0,age:0};
  for(let i=0;i<10&&!shot.spent;i++)advanceCannonShot(shot,1/fps);
  assert(shot.spent);check(expected,'live cannon on rising player at '+fps+' FPS');
  const center=p.ragdoll.core.center.clone(),timer=p.downTime;
  for(let i=0;i<Math.round(fps*.2);i++){move(p,1/fps,idle);updateCombat(players,1/fps);}
  assert(p.ragdoll.core.center.x>center.x+2&&p.ragdoll.core.center.y>center.y+2,'combined movement continues forward and upward');
  assert(!p.ground&&p.downTime===timer,'airborne recovery stays locked');
  // Floor contact removes downward motion naturally, but the knockdown keeps lateral travel.
  pose({y:.02,vx:5,vy:-18,vz:2,impulseX:0,impulseZ:0,grabVelocityX:0,grabVelocityZ:0});
  move(p,1/fps,idle);check(new T.Vector3(5,0,2),'heavy landing retains sideways momentum at '+fps+' FPS');
 }
 const encoder=new netcode.SnapshotEncoder(),decoder=new netcode.SnapshotDecoder();
 const packet={...networkSnapshot(),match:1,seq:1},received=decoder.decode(JSON.parse(JSON.stringify(encoder.encode(packet)))).players[0];
 assert.equal(received.vx,p.vx);assert.equal(received.vy,p.vy);assert.equal(received.vz,p.vz);assert(received.downTime>0&&received.pose,'network snapshots carry the combined velocity and physical pose');
 console.log('PASS: conserved knockdown momentum, additive spike/cannon impulses, zero-mean tumble, full incoming mechanism velocity once, collision projection, hard landings, launch trajectory at 30/60/120 FPS and network handoff');
`);
