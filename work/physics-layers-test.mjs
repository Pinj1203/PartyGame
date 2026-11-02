import {run} from './harness.mjs';
run(`
 clean();makeMap();resetPlayers(6);phase='race';
 const a=players[0],b=players[1],idle={x:0,z:0,jump:false};
 function pose(p,x=0,z=0,y=0){
   releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);
   Object.assign(p,{x,z,y,vx:0,vz:0,vy:0,alive:true,finished:false,ground:surfaces[0],facing:0,jumpCD:0});
   p.mesh.position.set(x,y,z);p.mesh.rotation.set(0,0,0);
 }
 players.forEach((p,i)=>pose(p,40+i*3));
 // Camera orbit never turns an idle actor or changes attack/grab direction.
 pose(a,0);pose(b,1.2);yaw=Math.PI;
 renderer.domElement.emit('pointerdown',{button:0});
 assert.equal(a.attackYaw,0);assert.equal(a.facing,0);
 updateCombat(players,.13);assert.equal(b.hitSerial,1);
 pose(a,0);pose(b,1.2);renderer.domElement.emit('pointerdown',{button:2});
 assert.equal(a.grabbing,b.i);assert.equal(a.facing,0);window.emit('pointerup',{button:2});
 // The actual loaded skeleton keeps exactly the same leg pose under an attack layer.
 pose(a,0);pose(b,3);a.vx=b.vx=4;
 startPunch(a);a.punchTime=.15;
 for(let i=0;i<8;i++){animateAnimal(a,1/60);animateAnimal(b,1/60);}
 const ar=a.mesh.userData.animal,br=b.mesh.userData.animal;
 assert.equal(ar.action,'Run');assert.equal(br.action,'Run');
 for(const name of ['Body','UpperLegL','LowerLegR','FootL','FootR']){
   assert(ar.bones.get(name).quaternion.angleTo(br.bones.get(name).quaternion)<1e-5,'punch does not replace '+name);
   assert(ar.bones.get(name).position.distanceTo(br.bones.get(name).position)<1e-6);
 }
 assert(ar.bones.get('UpperArmR').quaternion.angleTo(br.bones.get('UpperArmR').quaternion)>.05,'upper punch is visible');
 a.punchTime=-1;a.grabIntent=true;
 for(let i=0;i<20;i++){animateAnimal(a,1/60);animateAnimal(b,1/60);}
 assert(ar.grabWeight>.95,'empty grabs extend both arms');
 assert(ar.bones.get('FootL').quaternion.angleTo(br.bones.get('FootL').quaternion)<1e-5);
 a.ground=null;animateAnimal(a,1/60);assert.equal(ar.action,'Jump_Idle','reach does not replace jump');
 // Holding a player does not suppress the holder's jump.
 pose(a,0);pose(b,1.2);startGrab(a,players);move(a,1/60,{x:1,z:0,jump:true});
 assert(a.vy>9&&a.y>0,'full jump remains available while holding');
 // Actual side/underside triangles stop swept capsules, including fast impulses.
 clean();const base=addSurface('platform',0,0,0,0,30,30,true);resetPlayers(6);
 players.slice(1).forEach((p,i)=>pose(p,50+i*3));
 const wall=addSurface('platform',2,0,3,0,1,6,false,3);
 const p=players[0];pose(p,0);
 for(let i=0;i<60;i++)move(p,1/60,{x:1,z:0,jump:false});
 assert(p.x<1.15&&p.x>.5,'platform side blocks walking');
 pose(p,0);p.impulseX=35;move(p,.033,idle);
 for(let i=0;i<20;i++)move(p,.033,idle);
 assert(p.x<1.16,'substeps stop fast knockback crossing thin walls');
 const ceiling=addSurface('platform',-5,0,2.0,0,4,4);
 pose(p,-5);move(p,1/60,{x:0,z:0,jump:true});
 for(let i=0;i<14;i++)move(p,1/60,idle);
 assert(p.y<.3&&p.vy<=0,'underside blocks upward jumps');
 const fan=addSurface('fan',-9,0,0,Math.PI/4);
 assert(fan.worldBounds.max.y>1);
 // No filled AABB: empty space beside the fan stem stays traversable.
 const probe=new T.Vector3(-9.5,.18,.5),before=probe.clone();
 collisionWorld.sphere(probe,.06);
 assert(probe.distanceTo(before)<.001,'mesh narrow phase preserves empty corners');
 // Ragdoll gravity collapses the articulated body and resolves floor contact.
 pose(p,0,5);p.lastImpactX=1;knockDown(p);
 const startHead=p.ragdoll.nodes.get('Head').p.y;
 for(let i=0;i<240;i++){stepRagdoll(p,1/120,collisionWorld);p.mesh.position.set(p.x,p.y,p.z);animateAnimal(p,1/120);}
 const rag=p.ragdoll;
 assert(rag.active&&rag.nodes.get('Head').p.y<startHead-.15,'gravity physically collapses the upper body');
 assert(rag.ground===base,'ragdoll rests on solid geometry');
 for(const n of rag.nodes.values())assert(n.p.y>=n.radius-.03,'ragdoll '+n.name+' stays above floor');
 assert(!ar.actions.has('Death'),'no death animation participates in knockdown');
 assert([...rag.nodes.values()].every(n=>Number.isFinite(n.p.x)&&n.velocity.length()<25),'finite stable joints');
 for(const c of rag.links)assert(c.a.p.distanceTo(c.b.p)<c.max+.12,'joints remain connected');
 // A grip attaches to one hand; limbs trail and body follows without root teleporting.
 const holder=players[1];pose(holder,p.x-1.1,p.z);holder.facing=0;
 p.grabImmunity=0;assert(startGrab(holder,players,0),'downed body is grabbable');
 const initialX=p.x,handOffsets=[];
 for(let i=0;i<75;i++){
   holder.x-=.012;holder.facing=0;
   updateGrabs(players,1/120);
   stepRagdoll(p,1/120,collisionWorld);
   assert.equal(p.escapeProgress,0);
   if(p.ragdoll.grip)handOffsets.push(p.ragdoll.nodes.get(p.ragdoll.grip.node).p.x-p.x);
 }
 assert(p.x<initialX-.2,'hand constraint pulls the physical body across the floor');
 assert(handOffsets.length>50&&Math.max(...handOffsets)-Math.min(...handOffsets)>.05,'hand/body separation changes during drag');
 releaseGrab(holder,players);assert.equal(rag.grip,null,'release removes physical hand joint');
 // Recovery/reset can leave the physics pose without reusing stale joint transforms.
 p.downTime=0;p.getUpTime=.55;beginRecovery(p);
 for(let i=0;i<40;i++){p.getUpTime=Math.max(0,p.getUpTime-1/60);animateAnimal(p,1/60);}
 assert(!p.ragdoll.active&&!p.mesh.userData.animal.recovery);
 pose(p);assert.equal(p.ragdoll,null);
 // Repeated knockdown/recovery uses fresh joints and never leaves an old pose.
 for(let cycle=0;cycle<3;cycle++){
   pose(p,0,5);knockDown(p);
   for(let i=0;i<220;i++){move(p,1/60,idle);updateCombat(players,1/60);p.mesh.position.set(p.x,p.y,p.z);animateAnimal(p,1/60);}
   assert(p.alive&&!isDown(p)&&!p.ragdoll.active,'recover after physical collapse '+cycle);
   for(const bone of p.mesh.userData.animal.bones.values())assert(Number.isFinite(bone.quaternion.w));
 }
 // A prone player under an overhang waits for clearance, never appears on its roof.
 pose(p,-5,7);knockDown(p);
 // Enter the confined area prone; spawning an upright rigid body through an
 // existing ceiling is an invalid initial overlap, not a recovery scenario.
 for(let i=0;i<240;i++)stepRagdoll(p,1/120,collisionWorld);
 const lowCeiling=addSurface('platform',-5,7,1.45,0,12,12);
 for(let i=0;i<240;i++){move(p,1/60,idle);updateCombat(players,1/60);}
 assert(p.ragdoll.active&&p.y<.6,'low clearance keeps physics body below the ceiling');
 // A loose body thrown over an edge falls into the void, rather than resting on a fake ground.
 pose(p,14.2,5);p.impulseX=12;knockDown(p);
 for(let i=0;i<240&&p.alive;i++){move(p,1/120,idle);updateCombat(players,1/120);}
 assert(!p.alive,'ragdoll falling beyond the platform is eliminated');
 console.log('PASS: layered run/jump/reach, body-facing combat, swept sides/ceilings, articulated collapse, hand-constrained ragdoll dragging and recovery');
`);
