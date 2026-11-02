import {run} from './harness.mjs';
run(`
 clean();addSurface('platform',0,0,0,0,14,18,true);addSurface('platform',108,0,12,0,14,20,true);addSurface('platform',216,0,24,0,18,24,true);resetPlayers(6);phase='race';expert=true;
 const pad=addSurface('bounce',10.5,0,1);
 const upper=addSurface('platform',17,0,4,0,3.6,5);
 const p=players[1];
 // Carry the running approach into takeoff; air steering cannot manufacture a full run.
 p.x=10.5;p.z=0;p.y=walkY(pad)+.02;p.vy=-1;p.vx=6.8;p.vz=0;p.ground=null;p.plan=[pad,upper];p.jumpCD=0;
 move(p,1/60,{x:0,z:0,jump:false});
 assert(p.vy>10&&p.ground===null,'trampoline launches immediately');
 assert(p.plan[0]!==pad,'landing consumes the trampoline waypoint before it clears ground');
 assert.equal(p.plan[0],upper,'bounce trajectory can reach a higher destination');
 assert(bot(p,1/60).x>.5,'air steering points forward, not back at pad');
 let reached=false;
 for(let i=0;i<240&&p.alive;i++){
   move(p,1/60,bot(p,1/60));updateCombat(players,1/60);
   if(p.ground===upper){reached=true;break;}
 }
 assert(reached,'AI physically lands on next elevated platform');
 assert(p.x>14,'AI leaves trampoline instead of bouncing forever');
 // Replay approach from start, rather than only initializing on the pad.
 spawn();p.x=0;p.z=0;p.y=0;p.ground=surfaces[0];
 let launches=0,passed=false;
 for(let i=0;i<600&&p.alive;i++){
   const prevVy=p.vy;move(p,1/60,bot(p,1/60));updateCombat(players,1/60);
   if(p.launchSurface===pad&&p.vy>13&&prevVy<=0)launches++;
   if(p.ground===upper){passed=true;break;}
 }
 assert(passed,'approaching AI uses pad and reaches upper platform');
 assert(launches>=1&&launches<=2,'no repeated trampoline loop');
 const isolated=addSurface('bounce',42,35,2);
 spawn();p.x=isolated.x;p.z=isolated.z;p.y=walkY(isolated)+.02;p.vy=-1;p.ground=null;p.plan=[isolated];
 for(let i=0;i<900&&p.alive;i++){move(p,1/60,bot(p,1/60));updateCombat(players,1/60);}
 assert(p.giveUp&&!p.alive,'isolated trampoline cannot reset no-route timer and trap AI forever');
 console.log('PASS: AI trampoline waypoint advancement and physical landing on a higher platform');
`);
