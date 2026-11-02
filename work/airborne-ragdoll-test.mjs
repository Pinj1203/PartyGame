import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,50,50,true);resetPlayers(6);phase='race';
 const p=players[0],attacker=players[1],idle={x:0,z:0,jump:false};
 function pose(actor,x,y=0){
   resetCombat(actor);resetAnimal(actor.mesh);
   Object.assign(actor,{x,y,z:0,vx:0,vy:0,vz:0,alive:true,finished:false,ground:y===0?floor:null,facing:0});
   actor.mesh.position.set(x,y,0);actor.mesh.rotation.set(0,0,0);
 }
 players.forEach((p,i)=>pose(p,40+i*4));
 pose(p,0,8);
 assert(hazardImpact(p,1,0,5,7));
 assert(p.ragdoll.active&&isDown(p),'hazard activates ragdoll in the hit frame');
 assert(p.ragdoll.nodes.get('Body').velocity.y===7,'upward launch survives handoff to physics');
 const initialTimer=p.downTime;
 for(let i=0;i<180;i++)updateCombat(players,1/60);
 assert.equal(p.downTime,initialTimer,'airborne time never advances recovery');
 assert.equal(p.getUpTime,0);
 let landed=false,peak=p.y;
 for(let i=0;i<300&&!landed;i++){
   move(p,1/120,idle);
   const before=p.downTime;
   updateCombat(players,1/120);
   peak=Math.max(peak,p.y);
   if(!p.ground){
     assert.equal(p.downTime,before,'no countdown during free fall');
     assert.equal(p.getUpTime,0,'no get-up pose in the air');
   }else landed=true;
 }
 assert(peak>8.3,'physics launches upward instead of losing vertical momentum');
 assert(landed&&p.alive,'ragdoll lands on the real platform');
 for(let i=0;i<600&&isDown(p);i++){move(p,1/120,idle);updateCombat(players,1/120);animateAnimal(p,1/120);}
 assert(!isDown(p)&&p.alive,'recovery completes after landing');
 // Aerial punches only push sideways, preserving the jump/fall trajectory.
 pose(attacker,0,6);pose(p,1.2,6);
 p.vy=-3;
 assert(startPunch(attacker));updateCombat(players,.13);
 assert(!p.ragdoll?.active&&!isDown(p)&&!p.pendingKnockdown,'aerial punch does not enable ragdoll');
 assert(p.impulseX>0,'punch applies horizontal momentum');assert.equal(p.vy,-3,'fall velocity is preserved');
 const beforeX=p.x;
 for(let i=0;i<30;i++){move(p,1/120,idle);updateCombat(players,1/120);}
 assert(!isDown(p)&&!p.ground&&p.x>beforeX,'airborne target remains controllable while pushed');
 // Losing support during recovery must cancel the standing transition.
 pose(p,0,6);p.getUpTime=.4;
 move(p,1/120,idle);
 assert(p.ragdoll.active&&p.downTime>0&&p.getUpTime===0,'get-up is cancelled when support disappears');
 // A nearby floor alone is not permission to stand: there must be actual contact.
 pose(p,0,.4);knockDown(p);p.downTime=0;p.getUpTime=.55;p.ground=null;
 move(p,1/120,idle);
 assert(p.ragdoll.active&&p.getUpTime===0,'cannot stand merely because a floor is nearby');
 console.log('PASS: punch-only knockback, immediate hazard ragdoll, preserved launch velocity, air-time recovery lock, grounded recovery and interrupted get-up');
`);
