import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,60,60,true);resetPlayers(6);phase='race';
 const p=players[0],q=players[1],idle={x:0,z:0,jump:false};
 function pose(actor,x=0,y=0){
   releasePlayerGrabs(actor);resetCombat(actor);resetAnimal(actor.mesh);
   Object.assign(actor,{x,y,z:0,vx:0,vy:0,vz:0,ground:y===0?floor:null,jumpCD:0,facing:0,alive:true,finished:false});
   actor.mesh.position.set(x,y,0);actor.mesh.rotation.set(0,0,0);
 }
 function key(code,repeat=false){window.emit('keydown',{code,repeat,preventDefault(){}});}
 function up(code){window.emit('keyup',{code});}
 players.forEach((a,i)=>pose(a,40+i*3));
 // Ground and air use the same body-facing launch vector before gravity.
 for(const height of [0,3])for(const yaw of [0,Math.PI/2,-2.2])for(const [speed,expected] of [[0,8.8],[7,11.55],[14,12.1]]){
   pose(p,0,height);Object.assign(p,{facing:yaw,vx:Math.cos(yaw)*speed,vz:Math.sin(yaw)*speed,vy:height?-6:0});
   assert(startDive(p));
   const forward=p.vx*Math.cos(yaw)+p.vz*Math.sin(yaw);
   assert(Math.abs(forward-expected)<1e-8,'forward speed increases ten percent');
   assert(Math.abs(Math.atan2(p.vy,forward)*180/Math.PI-10)<1e-8,'launch points ten degrees above horizontal');
   assert(Math.abs(p.vz*Math.cos(yaw)-p.vx*Math.sin(yaw))<1e-8,'launch follows body facing');
 }
 // Shift always dives on a fresh press, whether standing or airborne.
 pose(p);key('ShiftLeft');move(p,1/60,idle);
 assert(p.diving&&!p.ground&&p.vy<3.5&&p.vx>=8,'ground Shift dives in a low arc, not a full jump');
 const velocity=p.vx;
 key('ShiftLeft',true);move(p,1/60,idle);
 assert.equal(p.vx,velocity,'OS key repeat cannot boost a dive');
 up('ShiftLeft');key('ShiftRight');move(p,1/60,idle);up('ShiftRight');
 assert(p.diving&&p.diveUsed&&p.vx===velocity,'switching Shift keys cannot stack a dive');
 key('ShiftLeft');move(p,1/60,idle);up('ShiftLeft');
 assert.equal(p.vx,velocity,'one dive per flight, without repeated boosts');
 assert(!startPunch(p)&&!startGrab(p,players),'all combat entry points reject a dive');
 renderer.domElement.emit('pointerdown',{button:0});
 renderer.domElement.emit('pointerdown',{button:2,preventDefault(){}});
 assert.equal(p.punchTime,-1);assert(!grabHeld&&!p.grabIntent);
 for(let i=0;i<10;i++){move(p,1/120,{x:0,z:1,jump:false});animateAnimal(p,1/120);}
 assert.equal(p.facing,0,'dive follows body facing rather than the camera or new input');
 assert(p.mesh.userData.animal.bodyPivot.rotation.z<-1,'visible belly-first pose');
 assert(p.mesh.userData.animal.grabWeight===0,'dive arms are not a gameplay grab');
 // Landing recovers before combat is re-enabled.
 let landed=!!p.ground;
 for(let i=0;i<300&&p.diving;i++){move(p,1/120,idle);updateCombat(players,1/120);if(p.ground)landed=true;}
 assert(landed&&p.diveRecovery>0&&!p.diving,'landing begins the short recovery');
 assert(!startPunch(p)&&!startGrab(p,players),'landing slide still blocks combat');
 for(let i=0;i<90&&isDiving(p);i++){move(p,1/120,idle);updateCombat(players,1/120);}
 assert(!isDiving(p)&&!p.diveUsed&&p.divePose===0,'landing resets dive availability');
 key('ShiftLeft',true);move(p,1/60,idle);assert(!isDiving(p),'holding Shift through landing never auto-dives');
 pose(q,p.x+1.2);p.punchCooldown=0;p.stagger=0;p.grabCooldown=0;
 assert(startGrab(p,players),'new right-click can grab immediately after recovery');releaseGrab(p,players);
 p.grabCooldown=0;assert(startPunch(p),'punch is restored after recovery');
 // Starting a dive cancels an unresolved swing and drops a held player.
 pose(p,0,3);pose(q,1.2,3);assert(startPunch(p));assert(startDive(p));
 updateCombat(players,.13);assert.equal(q.hitSerial,0,'cancelled windup never lands a hit');
 pose(p,0,3);pose(q,1.2,3);assert(startGrab(p,players));grabHeld=true;
 assert(startDive(p));assert.equal(q.grabbedBy,null);assert.equal(p.grabbing,null);assert(!grabHeld);
 pose(p,0,3);pose(q,-1.2,3);assert(startGrab(q,players));
 assert(!startDive(p),'being held cannot be bypassed with a dive');
 releaseGrab(q,players);
 // Shift remains inert while downed, building, or after focus loss.
 pose(p);knockDown(p);key('ShiftLeft');move(p,1/120,idle);up('ShiftLeft');
 assert(!isDiving(p)&&p.ragdoll.active);
 pose(p);phase='build';key('ShiftLeft');up('ShiftLeft');assert(!p.shiftAction);
 phase='race';key('ShiftLeft');window.emit('blur',{});assert(!p.shiftAction);
 // Space is the sole jump key; a fresh Shift may dive from that jump too.
 pose(p);move(p,1/60,{x:1,z:0,jump:true});assert(p.vy>9&&!isDiving(p));
 up('ShiftLeft');key('ShiftLeft');move(p,1/60,idle);up('ShiftLeft');assert(p.diving);
 // The swept tilted capsule stops its nose at an actual side wall.
 const wall=addSurface('platform',2,0,1.2,0,1,6);
 pose(p,0,.1);startDive(p);p.divePose=1;
 collisionWorld.movePlayer(p,new T.Vector3(0,.1,0),new T.Vector3(5,.1,0));
 assert(p.x<.85&&p.x>0,'dive nose cannot pass through a platform side');
 // A low overhang prevents standing, then recovery resumes when clear.
 const ceiling=addSurface('platform',-8,0,1.8,0,8,8);
 pose(p,-8);p.diving=false;p.diveRecovery=.3;p.diveUsed=true;p.divePose=1;
 for(let i=0;i<90;i++)move(p,1/120,idle);
 assert(isDiving(p)&&p.divePose===1&&p.y<.1,'cannot stand through a low ceiling');
 collisionWorld.entries.delete(ceiling);surfaces.splice(surfaces.indexOf(ceiling),1);world.remove(ceiling.mesh);
 for(let i=0;i<90;i++)move(p,1/120,idle);
 assert(!isDiving(p),'cleared headroom restores standing');
 // Hazard hits interrupt a dive without tearing or snapping the current pose.
 pose(p,0,4);startDive(p);p.divePose=1;animateAnimal(p,1/60);
 p.mesh.updateMatrixWorld(true);
 const head=p.mesh.userData.animal.bones.get('Head'),before=head.getWorldPosition(new T.Vector3());
 assert(hazardImpact(p,1,0,8,6));ragdoll.applyRagdollPose(p);
 assert(!isDiving(p)&&p.ragdoll.active&&p.getUpTime===0);
 assert(head.getWorldPosition(new T.Vector3()).distanceTo(before)<1e-4,'ragdoll inherits the dive orientation');
 spawn();assert(players.every(p=>!isDiving(p)&&!p.diveUsed&&!p.shiftAction&&p.divePose===0));
 console.log('PASS: ground/air single-press Shift dive, Space jump, no repeat/stacking, combat cancellation/lock, landing recovery, swept dive collision and ragdoll handoff');
`);
