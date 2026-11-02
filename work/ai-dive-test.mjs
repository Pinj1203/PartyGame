import {run} from './harness.mjs';
run(`
 function diveFixture(x=14,z=0,y=0,w=8,d=8){
   clean();const origin=addSurface('platform',0,0,0,0,8,8,true);
   addSurface('platform',100,40,0);addSurface('platform',216,40,24);
   const target=addSurface('platform',x,z,y,0,w,d,true);
   resetPlayers(6);phase='race';expert=true;
   const p=players[1];players.forEach(q=>q.alive=q===p);
   Object.assign(p,{x:-1,y:0,z:0,vx:0,vz:0,vy:0,ground:origin,facing:0});
   p.mesh.position.set(p.x,p.y,p.z);
   return {origin,target,p};
 }
 function traverse(c,fps=60){
   let jumps=0,wasGrounded=true;
   for(let i=0;i<fps*8&&c.p.alive;i++){
     raceTime+=1/fps;
     const input=bot(c.p,1/fps);
     if(input.jump&&c.p.ground)jumps++;
     move(c.p,1/fps,input);updateCombat(players,1/fps);
     assert(!isDown(c.p),'planned flight must not end in a hard fall');
     if(c.p.ground===c.target&&!isDiving(c.p))return {landed:true,jumps};
   }
   return {landed:false,jumps};
 }
 // Actual controller integration, including landing braking, at several rates.
 for(const fps of [30,60,120]){
   const c=diveFixture();
   assert(!canJump(c.origin,c.target),'six metre gap exceeds ordinary reach');
   assert(canTraverse(c.origin,c.target),'route graph includes a validated jump/dive');
   assert(route(c.origin,c.p).includes(c.target));
   const result=traverse(c,fps);
   assert(result.landed&&c.p.alive,'AI lands and recovers on the far platform at '+fps+' fps');
   assert(result.jumps===1&&c.p.aiDiveCount===1,'one jump and one deliberate aerial dive');
   assert(divePlanner.safeLanding(c.target,c.p),'braking leaves the whole body safely inside the platform');
 }
 for(const [x,z,y] of [[14,3,0],[13,0,1],[15,0,-1]]){
   const c=diveFixture(x,z,y);
   assert(divePlanner.link(c.origin,c.target),'diagonal/vertical dive route exists: '+[x,z,y]);
   assert(traverse(c).landed&&c.p.aiDiveCount===1,'AI handles offset and vertical landing points');
 }
 const easy=diveFixture(10);
 assert(traverse(easy).landed&&easy.p.aiDiveCount===0,'ordinary safe jumps do not waste a dive');
 const tooFar=diveFixture(22);assert(!divePlanner.link(tooFar.origin,tooFar.target),'reject impossible distance');
 const narrow=diveFixture(10.7,0,0,1.4,3);assert(!divePlanner.link(narrow.origin,narrow.target),'reject a landing too short for body and slide');
 // Adding geometry invalidates cached edges, including overhead obstacles.
 const blocked=diveFixture();assert(divePlanner.link(blocked.origin,blocked.target));
 addSurface('platform',7,0,2.2,0,1,8);
 assert(!divePlanner.link(blocked.origin,blocked.target),'reject a collision along the arc after building an obstacle');
 const roof=diveFixture();addSurface('platform',14,0,1.5,0,8,8);
 assert(!divePlanner.link(roof.origin,roof.target),'reject a landing with no recovery headroom');
 const windy=diveFixture();addSurface('fan',6,0,0);
 assert(!divePlanner.link(windy.origin,windy.target),'wind invalidates the ballistic landing forecast');
 const field=diveFixture();addSurface('field',14,0,0,Math.PI);
 assert(!divePlanner.link(field.origin,field.target),'do not dive through an active wave field');
 const icy=diveFixture();assert(divePlanner.link(icy.origin,icy.target));freezeSurface(icy.target);
 assert(!divePlanner.link(icy.origin,icy.target),'ice invalidates cached dives with insufficient braking distance');
 // Occupied landing, incoming projectiles and disruptive impulses are rechecked.
 const traffic=diveFixture(),link=divePlanner.link(traffic.origin,traffic.target);
 const other=players[2];Object.assign(other,{alive:true,finished:false,x:link.stop.x,z:link.stop.z,y:0,vx:0,vz:0});
 Object.assign(traffic.p,{x:link.takeoff.x,z:link.takeoff.z,vx:7,vy:0,ground:traffic.origin});
 const input=aiLongJump(traffic.p,traffic.target,link);
 assert(!input.jump&&!traffic.p.shiftAction&&input.x<0,'occupied landing makes AI back away and retry');
 other.alive=false;
 const flight={x:5.3,z:0,y:2,vy:3,vx:7,vz:0,facing:0,speed:7,actor:traffic.p};
 const choice=divePlanner.choose(flight,traffic.target,[0],traffic.origin,true);
 assert(choice,'known aerial state has a safe dive');
 const projectile=sphere(.3,0x303f41,world);
 const crossing=choice.path[Math.floor(choice.path.length/2)];
 projectile.position.set(crossing.x,crossing.y+.6,crossing.z);
 shots=[{mesh:projectile,dx:0,dz:0,spent:false}];
 assert(!divePlanner.clear(choice,traffic.origin,true),'incoming shot cancels a prospective dive');
 shots=[];
 Object.assign(traffic.p,{...flight,ground:null,airTime:.3,stagger:.2,aiDivePlan:{target:traffic.target,diveAt:0}});
 aiAirInput(traffic.p,traffic.target,1/60);assert(!traffic.p.shiftAction,'staggered AI does not commit to a stale forecast');
 spawn();assert(players.every(p=>p.aiDivePlan===null&&p.aiRunup===null&&p.aiDiveCount===0),'round reset clears AI flight plans');
 $('count').value='6';$('difficulty').value='expert';showAIDiveDemo();
 for(let i=0;i<360;i++)tick(last+1000/60);
 const demo=players[1];
 assert(demo.aiDiveCount===1&&demo.ground===demo.demoTarget&&!isDiving(demo),'visible demonstration uses the real bot and movement loop');
 console.log('PASS: deliberate jump/dive traversal at 30/60/120 fps, safe braking, diagonal/vertical targets, normal-jump preference, obstacle/hazard/crowd rejection and live revalidation');
`);
