import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,30,30,true);resetPlayers(6);phase='race';
 const holder=players[0],victim=players[1],idle={x:0,z:0,jump:false};
 function pose(p,x=0){
   releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);
   Object.assign(p,{x,z:0,y:0,vx:0,vz:0,vy:0,ground:floor,alive:true,finished:false,
     facing:0,jumpCD:0,plan:[],think:0,giveUp:false});
   p.mesh.position.set(x,0,0);p.mesh.rotation.set(0,0,0);
 }
 players.forEach((p,i)=>pose(p,40+i*3));
 // Both modes use the actual movement escape timer, never an instant jump.
 for(const inputFor of [bot,practiceInput])for(const fps of [30,60,120]){
   pose(holder);pose(victim,1.1);startGrab(holder,players);
   victim.struggleJump=true; // Previous navigation jump must not leak into escape.
   let escapes=0;
   for(let frame=0;frame<fps/2;frame++){
     const input=inputFor(victim,1/fps);
     assert(!input.jump,'held AI starts with movement instead of a jump');
     assert(Math.hypot(input.x,input.z)>.9,'AI sustains directional intent');
     recordGrabInput(victim,input);
     updateGrabs(players,1/fps,()=>false,()=>escapes++);
     if(frame<fps/2-1)assert.equal(holder.grabbing,victim.i,'no premature release');
     move(holder,1/fps,idle);move(victim,1/fps,input);
     assert(victim.ground&&Math.abs(victim.vy)<.01,'movement escape remains grounded');
   }
   assert.equal(escapes,1);assert.equal(victim.grabbedBy,null);
   assert(victim.grabImmunity>0&&holder.grabNeedsRelease);
 }
 // At the edge, move along the floor instead of struggling straight into the void.
 pose(holder,13.4);pose(victim,14.5);startGrab(holder,players);
 const edgeInput=bot(victim,1/60);
 assert(edgeInput.x<.05&&!edgeInput.jump);
 assert(Number.isFinite(floorAt(floor,victim.x+edgeInput.x*.65,victim.z+edgeInput.z*.65)));
 // A downed / recovering AI cannot accumulate escape. Once up it starts moving.
 for(const inputFor of [bot,practiceInput]){
   pose(holder);pose(victim,1.1);knockDown(victim);startGrab(holder,players);
   for(let i=0;i<40;i++){
     const input=inputFor(victim,1/60);recordGrabInput(victim,input);updateGrabs(players,1/60);
     assert(!input.jump&&Math.hypot(input.x,input.z)===0&&victim.escapeProgress===0);
   }
   victim.downTime=0;victim.getUpTime=.2;
   const recovering=inputFor(victim,1/60);assert(!recovering.jump&&recovering.x===0&&recovering.z===0);
   victim.getUpTime=0;const standing=inputFor(victim,1/60);
   assert(!standing.jump&&Math.hypot(standing.x,standing.z)>.9);
 }
 // Jump is situational and delayed, only for an incoming wave at foot height.
 pose(holder);pose(victim,1.1);startGrab(holder,players);
 waves=[{x:-2,z:0,y:.35,r:2.5,hitPlayers:new Set()}];
 assert(!bot(victim,1/60).jump,'even a wave does not cause an instant grab reaction');
 recordGrabInput(victim,{x:1,z:0,jump:false});updateGrabs(players,.2);
 assert(bot(victim,1/60).jump&&practiceInput(victim,1/60).jump);
 victim.ground=null;assert(!bot(victim,1/60).jump,'no aerial jump escape attempt');
 victim.ground=floor;waves[0].y=4;assert(!bot(victim,1/60).jump);
 waves[0].y=.35;waves[0].hitPlayers.add(victim.i);assert(!bot(victim,1/60).jump);
 waves=[];
 // Confirm the user-visible practice frame loop uses the new policy too.
 players.forEach((p,i)=>pose(p,40+i*3));pose(holder);pose(victim,1.1);
 practiceMode=true;remaining=999;raceTime=0;keys={};startGrab(holder,players);
 for(let i=0;i<29;i++)tick(last+1000/60);
 assert.equal(holder.grabbing,victim.i);assert(victim.ground&&victim.escapeProgress>.95);
 tick(last+1000/60);
 assert.equal(holder.grabbing,null);assert(victim.ground&&Math.abs(victim.vy)<.01);
 assert($('status').textContent.includes('掙脫了'));
 console.log('PASS: AI movement-first escape in race/practice at 30/60/120 fps, 0.5 s hold, ledge-aware direction, downed protection and delayed wave-only jump');
`);
