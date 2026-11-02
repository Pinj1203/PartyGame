import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,100,100,true);resetPlayers(6);phase='race';practiceMode=false;
 const p=players[0],victim=players[1],third=players[2];
 function pose(q,x=0,z=0){releasePlayerGrabs(q);resetCombat(q);Object.assign(q,{alive:true,finished:false,x,y:.002,z,vx:0,vy:0,vz:0,ground:floor,facing:0,jumpCD:0});q.mesh.position.set(x,.002,z);}
 for(const q of players)pose(q,-30-q.i*2,30);
 const impulse=speed=>contactImpulse(new T.Vector3(1,0,0),new T.Vector3(speed,0,0),new T.Vector3());
 pose(p);mechanicalImpact(p,impulse(4.5*1.55),new T.Vector3());assert(!isDown(p)&&p.impulseX>0,'maximum stationary bar-tip hit remains below the threshold');
 pose(p);mechanicalImpact(p,impulse(Math.sqrt(COMBAT.knockdownEnergy*2)+.01),new T.Vector3());assert(isDown(p)&&p.ragdoll.active,'above-threshold impact activates physical collapse');
 const wall=addSurface('platform',4,0,4,0,1,8,false,4);
 pose(p,2.5);p.vx=7;for(let i=0;i<8;i++)move(p,1/60,{x:1,z:0,jump:false});assert(!isDown(p),'ordinary running into a wall stays upright');
 pose(p,2.5);p.impulseX=24;for(let i=0;i<8&&!isDown(p);i++)move(p,1/60,{x:0,z:0,jump:false});assert(isDown(p)&&p.x<3.5,'high-energy wall impact collapses without passing through');

 facilities=new PlaceableFacilities({world,updateSolidBounds,collision:collisionWorld,surfaces:()=>surfaces,supportAt});
 const hammer=addSurface('hammer',20,20,.08);hammer.offset=0;facilities.reset();const hf=hammer.mesh.userData.facility;
 assert.equal(hf.radius,2.1);assert(hf.speed>1.55*3,'new hammer rotates substantially faster than the bar');
 pose(p,21.55,19.1);facilities.hit(p,hitHazard,hitMechanism);assert(isDown(p),'fast hammer head transfers enough energy to knock down');
 const empty=collisionWorld.sphere(new T.Vector3(18.5,.2,20),.12);assert(!empty.some(c=>c.surface===hammer),'hammer has no shared floor');
 pose(p,21.55,19.1);p.y=4;facilities.hit(p,hitHazard,hitMechanism);assert(!isDown(p),'above-head clearance is safe');
 const pend=addSurface('pendulum',-20,20,.08,Math.PI/2);pend.offset=0;facilities.pose(0);
 assert(pend.mesh.getObjectByName('pendulum-axle')&&pend.mesh.getObjectByName('swing-direction'),'axle and direction marker are present');
 assert.equal(pend.mesh.getObjectByName('pendulum-hammer-head').geometry.type,'BoxGeometry');
 const axle=pend.mesh.getObjectByName('pendulum-axle'),end=new T.Vector3(0,1,0).applyMatrix4(axle.matrixWorld),origin=new T.Vector3().applyMatrix4(axle.matrixWorld);
 assert(Math.abs(end.x-origin.x)<.01&&Math.abs(end.z-origin.z)>.9,'R rotates the visible axle with the swing plane');

 const spikes=addSurface('spike',20,-20,.08);assert.equal(spikes.mesh.userData.solids.filter(m=>m.name==='spike-tip').length,9);
 assert(Math.abs(spikes.w-3)<.001&&Math.abs(spikes.d-3)<.001,'spike region is 3m by 3m');
 pose(p,21,-19);p.y=.1;move(p,1/60,{x:0,z:0,jump:false});assert(isDown(p),'outer row of spikes is hazardous');
 pose(p,22.2,-20);move(p,1/60,{x:0,z:0,jump:false});assert(!isDown(p),'outside the spike region remains safe');

 for(const fps of [30,60,120]){
  pose(victim,12,-10);const m=sphere(.3,0,world);m.position.set(0,.8,-10);const shot={mesh:m,dx:CANNON.speed,dz:0,age:0};
  for(let i=0;i<fps&&!shot.spent;i++)advanceCannonShot(shot,1/fps);
  assert(shot.spent&&isDown(victim),'40m/s projectile hits at '+fps+' FPS');
 }
 pose(victim,12,-10);const shield=addSurface('platform',6,-10,3,0,.12,5,false,3);
 const m=sphere(.3,0,world);m.position.set(0,.8,-10);const shot={mesh:m,dx:CANNON.speed,dz:0,age:0};advanceCannonShot(shot,.5);
 assert(shot.spent&&!isDown(victim)&&m.position.x<6,'high-speed shot cannot tunnel through a thin wall to hit someone behind it');
 const free=sphere(.3,0,world);free.position.set(-10,10,-35);advanceCannonShot({mesh:free,dx:CANNON.speed,dz:0,age:0},.25);assert(Math.abs(free.position.x)<.001,'cannon travels 10m in a quarter second');

 players.forEach(q=>q.score=0);pose(p,0);pose(victim,1.2);pose(third,-10,10);
 startPunch(p);updateCombat(players,.13);assert.equal(victim.fallCredit,p.i);assert(!isDown(victim),'punch remains knockback only');
 victim.ground=null;victim.y=-10;die(victim,'掉進雲海了');assert.equal(p.score,1);assert.equal(p.roundKnockouts,1);die(victim,'duplicate');assert.equal(p.score,1);
 endRound();assert.equal(p.score,1);assert.equal(p.delta,1,'round result includes already-awarded knockout points exactly once');endRound();assert.equal(p.score,1);
 phase='race';pose(p,0);pose(victim,1.2);startGrab(p,players);p.vx=-2;updateGrabs(players,1/60);releaseGrab(p,players);
 assert.equal(victim.fallCredit,p.i,'dragging retains attribution after release');die(victim,'掉進雲海了');assert.equal(p.score,2);
 pose(p,0);pose(victim,1.2);startPunch(p);updateCombat(players,.13);updateCombat(players,COMBAT.fallCreditSafeSeconds+.1);die(victim,'掉進雲海了');assert.equal(p.score,2,'safe landing clears old attack credit');
 pose(p,0);pose(victim,1.2);startPunch(p);updateCombat(players,.13);victim.ground=null;updateCombat(players,COMBAT.fallCreditSeconds+.1);die(victim,'掉進雲海了');assert.equal(p.score,2,'expired attacks cannot claim a later fall');
 pose(p,0);pose(victim,1.2);startPunch(p);updateCombat(players,.13);pose(third,2.4);third.facing=Math.PI;startPunch(third);updateCombat(players,.13);die(victim,'掉進雲海了');assert.equal(third.score,1,'latest valid hitter gets credit');assert.equal(p.score,2);
 pose(victim);die(victim,'自己掉落');assert.equal(p.score,2);assert.equal(third.score,1,'unassisted falls award no points');
 practiceMode=true;pose(p,0);pose(victim,1.2);startPunch(p);updateCombat(players,.13);die(victim,'practice');assert.equal(p.score,2,'practice cannot farm points');practiceMode=false;
 phase='race';pose(p,0);pose(victim,1.2);startPunch(p);updateCombat(players,.13);net={isGuest:true};die(victim,'guest');assert.equal(p.score,2,'guest never awards scores');net=null;
 // The punch must clear the whole foot footprint; partial flat-edge support no longer slides away.
 const scoreBeforeFall=p.score;pose(p,48.85);pose(victim,49.95);startPunch(p);updateCombat(players,.13);
 for(let i=0;i<180&&victim.alive;i++){move(victim,1/60,{x:0,z:0,jump:false});updateCombat(players,1/60);}
 assert(!victim.alive&&p.score===scoreBeforeFall+1,'physical fall: '+JSON.stringify({alive:victim.alive,x:victim.x,y:victim.y,credit:victim.fallCredit,ttl:victim.fallCreditTime,score:p.score,before:scoreBeforeFall,hit:victim.hitSerial}));
 spawn();assert(players.every(q=>q.roundKnockouts===0&&q.fallCredit===null),'round reset clears credit and knockout counts');
 console.log('PASS: collision-energy threshold, high-speed walls, hammer reach/force, pendulum axle, 9 spikes, 40m/s swept cannon, last-push scoring, safe/expired credit, practice/guest guards and no double awards');
`);
