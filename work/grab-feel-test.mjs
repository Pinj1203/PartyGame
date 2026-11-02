import {run} from './harness.mjs';
run(`{
 clean();const floor=addSurface('platform',0,0,0,0,180,80,true);resetPlayers(6);phase='race';
 const h=players[0],p=players[1],other=players[2],idle={x:0,z:0,jump:false};
 function pose(q,x=0,z=0){
   releasePlayerGrabs(q);resetCombat(q);resetAnimal(q.mesh);
   Object.assign(q,{x,z,y:0,vx:0,vz:0,vy:0,ground:floor,alive:true,finished:false,facing:0,jumpCD:0});
   q.mesh.position.set(x,0,z);q.mesh.rotation.set(0,0,0);
 }
 players.forEach((q,i)=>pose(q,60+i*3));
 // Acquisition favors the person in front over a closer bystander at the side.
 pose(h);pose(p,1.35);pose(other,.65,.85);
 assert(startGrab(h,players));assert.equal(h.grabbing,p.i);
 pose(h);pose(p,1.2);pose(other,70);
 releaseGrab(h,players);assert.equal(h.grabCooldown,0,'releasing an empty reach has no cooldown');
 assert(startGrab(h,players),'can immediately try again after an empty reach');
 // Three frame rates: stable separation, bidirectional pushing/pulling, no stored spring kick.
 const measurements=[];
 for(const fps of [30,60,120])for(const direction of [-1,1]){
   pose(h);pose(p,1.2);startGrab(h,players);
   let maxGap=0;
   for(let i=0;i<fps*2;i++){
     updateGrabs(players,1/fps);move(h,1/fps,{x:direction,z:0,jump:false});move(p,1/fps,idle);
     resolvePlayerContacts([h,p],1/fps);updateCombat(players,1/fps);
     maxGap=Math.max(maxGap,Math.hypot(h.x-p.x,h.z-p.z));
   }
   assert(maxGap<1.3,'close stable grip');
   assert(Math.abs(Math.hypot(h.x-p.x,h.z-p.z)-1.08)<.04,'settles without a long rubber band');
   assert((p.x-1.2)*direction>1,'holder can push and pull');
   assert.equal(p.impulseX,0,'grab does not pollute knockback');
   const releaseX=p.x;releaseGrab(h,players);
   assert(h.grabVelocityX===0&&p.grabVelocityX===0);
   for(let i=0;i<fps;i++)move(p,1/fps,idle);
   assert(Math.abs(p.x-releaseX)<.002,'release immediately stops passive dragging');
   measurements.push({fps,direction,x:releaseX});
 }
 for(const direction of [-1,1]){
   const xs=measurements.filter(v=>v.direction===direction).map(v=>v.x);
   assert(Math.max(...xs)-Math.min(...xs)<.12,'consistent physical travel across frame rates');
 }
 // Side acquisition preserves the relative bearing; it does not suck the target across the hands.
 pose(h);pose(p,.85,.85);startGrab(h,players);
 for(let i=0;i<30;i++){updateGrabs(players,1/60);move(h,1/60,idle);move(p,1/60,idle);}
 assert(Math.abs((p.x-h.x)-(p.z-h.z))<.015,'stable diagonal grip');
 const targetCenter=new T.Vector3(p.x,p.y+.65,p.z);
 assert(Math.abs(h.grabVisualTarget.distanceTo(targetCenter)-.27)<.001,'hands contact outer body');
 animateAnimal(p,1/60);assert(p.mesh.userData.animal.grabRing.visible);
 releaseGrab(h,players);animateAnimal(p,1/60);assert(!p.mesh.userData.animal.grabRing.visible);
 // Clearing the grab must preserve real punch/hazard momentum.
 pose(h);pose(p,1.2);startGrab(h,players);p.impulseX=3;
 updateGrabs(players,1/60);releaseGrab(h,players);assert.equal(p.impulseX,3);
 // Held locomotion animates from actual constrained motion, including passive drag.
 pose(h);pose(p,1.2);startGrab(h,players);
 for(let i=0;i<45;i++){
   updateGrabs(players,1/60);move(h,1/60,{x:-1,z:0,jump:false});move(p,1/60,idle);animateAnimal(p,1/60);
 }
 assert(Math.abs(p.vx)<.05&&p.grabVelocityX<-.5,'passive speeds '+p.vx+' / '+p.grabVelocityX);
 assert(p.mesh.userData.animal.strideWeight>.8,'passive target shuffles rather than skating');
 // The visible isolated practice uses the real grab/escape loop and disables only AI punching.
 $('count').value='6';showGrabPractice();
 assert(grabPractice&&practiceMode&&$('phaseLabel').textContent==='抓取手感練習');
 renderer.domElement.emit('pointerdown',{button:2,preventDefault(){}});
 assert.equal(players[0].grabbing,1);assert($('status').textContent.includes('抓住'));
 for(let i=0;i<31;i++)tick(last+1000/60);
 assert.equal(players[0].grabbing,null);
 assert(!players[0].grabIntent,'escaped grip retracts the hands');
 assert($('combatHint').textContent.includes('鬆開右鍵'));
 assert(players.every(q=>q.punchSerial===0),'practice has no competing AI punches');
 window.emit('pointerup',{button:2});
 assert(!players[0].grabNeedsRelease);
 practice();assert(!grabPractice,'regular practice restores AI combat');
 console.log('PASS: front-target acquisition, shared close push/pull at 30/60/120 fps, instant release without stored pull, diagonal contact, locomotion feedback and isolated practice');
}`);
