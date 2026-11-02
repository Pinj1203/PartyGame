import {run} from './harness.mjs';
run(`
 clean();const floor=addSurface('platform',0,0,0,0,80,80,true);resetPlayers(6);phase='race';practiceMode=true;
 const p=players[0];
 function sample(fps,hold){resetCombat(p);Object.assign(p,{x:0,z:0,y:.002,vx:0,vz:0,vy:0,ground:floor,jumpCD:0,alive:true,finished:false});let apex=0;
  for(let i=0;i<fps*2;i++){const held=i/fps<hold;move(p,1/fps,{x:0,z:0,jump:held,jumpHeld:held});apex=Math.max(apex,p.y);if(i>0&&(p.ground||p.landingSpeed>0))break;}
  assert(p.ground||p.landingSpeed>0,'first flight reaches a real landing, whether held input rebounds or not');return apex;
 }
 for(const fps of [30,60,120]){const short=sample(fps,1/fps),long=sample(fps,2);assert(short>1.25&&long>1.9&&long-short>.35&&long-short<.85,'tap is lower, full hold preserves normal high jump at '+fps);}
 const long30=sample(30,2),long120=sample(120,2);assert(Math.abs(long30-long120)<.15);
 for(const fps of [30,60,120]){
  resetCombat(p);Object.assign(p,{x:0,z:0,y:.002,vx:7,vz:0,vy:0,ground:floor,jumpCD:0,alive:true,finished:false});
  let flight=0;
  for(let i=0;i<fps*2;i++){
   move(p,1/fps,{x:i===0?1:0,z:0,jump:i===0,jumpHeld:true});flight+=1/fps;
   assert(Math.abs(p.vx-6.16)<.001,'takeoff slows once; releasing direction preserves airborne momentum');
   if(p.ground)break;
  }
  assert(p.ground&&flight>.8&&flight<1,'normal held-jump flight time is preserved');
  assert(p.x/(7*flight)>.87&&p.x/(7*flight)<.89,'coasting range is about 12% shorter at '+fps+' FPS');
 }
 resetCombat(p);Object.assign(p,{x:0,z:0,y:.002,vx:7/Math.sqrt(2),vz:7/Math.sqrt(2),vy:0,ground:floor,jumpCD:0});
 move(p,1/60,{x:Math.SQRT1_2,z:Math.SQRT1_2,jump:true,jumpHeld:true});
 assert(Math.abs(Math.hypot(p.vx,p.vz)-6.16)<.001&&Math.abs(p.vx-p.vz)<.001,'diagonal takeoff keeps its direction and the same speed reduction');
 sample(60,0);window.emit('keydown',{code:'Space',repeat:false,preventDefault(){}});window.emit('keyup',{code:'Space'});
 const quick=raceInput(p,1/60);assert(quick.jumpPressed&&!quick.jumpHeld,'a tap between frames is retained');move(p,1/60,quick);assert(p.vy>0&&!p.jumpActive,'tap starts a short jump');
 const remote=players[1];resetCombat(remote);Object.assign(remote,{x:5,z:0,y:.002,vx:0,vz:0,vy:0,ground:floor,jumpCD:0,alive:true,finished:false});
 net={online:true,running:true,isHost:true,slot:0,room:{members:players.map(()=>({human:true}))},inputs:new Map([[1,{x:0,z:0,jump:false,grab:false,actions:{jump:1,dive:0,punch:0},received:performance.now()}]])};
 const packet=raceInput(remote,1/60);assert(packet.jumpPressed&&!packet.jumpHeld,'remote quick release preserves its press serial');move(remote,1/60,packet);assert(remote.vy>0&&remote.vy<9,'remote short jump applies same height cut');
 assert(!raceInput(remote,1/60).jumpPressed,'repeated input packet does not repeat jump');
 net=null;resetCombat(p);Object.assign(p,{ground:floor,y:.002,jumpCD:0,vy:0});move(p,1/60,{x:0,z:0,jump:true,jumpHeld:true});startDive(p);assert(!p.jumpActive,'dive cancels hold-height control');
 console.log('PASS: tap/hold heights and reduced takeoff range at 30/60/120 FPS, preserved airborne inertia and diagonal heading, quick local/remote taps, deduplication and dive separation');
`);
