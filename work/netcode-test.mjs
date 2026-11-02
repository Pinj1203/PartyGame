import assert from 'node:assert/strict';
import {SnapshotEncoder,SnapshotDecoder,SnapshotTimeline,LocalPredictor,STEP,PLAYER_FIELDS,interpolateActor} from '../dist/netcode.js';
import {run} from './harness.mjs';

// Arrival jitter changes buffer depth gradually, never the sampled world clock.
for(const fps of [30,60,120]){
 const timeline=new SnapshotTimeline(),packets=[];let last=-Infinity,maxStep=0,now=0;
 for(let i=0;i<160;i++)if(i%17!==9)packets.push({arrival:i*.05+.075+(Math.sin(i*13)+1)*.02,state:{seq:i+1,match:1,round:1,phase:'race',raceTime:i*.05}});
 for(let frame=0;frame<fps*8;frame++){
  now=frame/fps;while(packets[0]?.arrival<=now){const packet=packets.shift();timeline.push(packet.state,now);}
  const s=timeline.sample(1/fps,now);if(!s)continue;
  assert(s.time>=last,'display clock never rewinds');if(Number.isFinite(last)&&now>1)maxStep=Math.max(maxStep,s.time-last);last=s.time;
 }
 assert(maxStep<1/fps*1.16,'jitter does not cause packet-sized visual jumps');
 const stopped=timeline.sample(.5,20);assert(stopped.time<=timeline.frames.at(-1).state.raceTime,'long gaps freeze at known state');
 timeline.push({seq:1,match:2,round:1,phase:'race',raceTime:0},21);assert.equal(timeline.frames.length,1,'new match resets history');
}
assert(Math.abs(interpolateActor({facing:3.13,alive:true},{facing:-3.13,alive:true},.5).facing-Math.PI)<.02,'angles take shortest arc');

run(`
 const {SnapshotEncoder,SnapshotDecoder}=netcode;
 clean();makeMap(0);resetPlayers(10);phase='race';raceTime=1;
 for(let i=0;i<20;i++)addSurface('platform',20+i*3,30,0);
 const encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder();
 const full=networkSnapshot();full.match=1;full.seq=1;
 assert(full.players.every(p=>!p.pose),'ordinary animation sends no skeletons');
 const wire=encoder.encode(full);encoder.committed(wire);
 const decoded=decoder.decode(JSON.parse(JSON.stringify(wire)));assert.equal(decoded.players.length,10);assert.equal(decoded.surfaces.length,surfaces.length);
 full.seq=2;const delta=encoder.encode(full);assert(!delta.meta,'unchanged scene excluded');
 const bytes=new TextEncoder().encode(JSON.stringify(delta)).length;
 assert(bytes<6000,'steady 10-player state is compact');
 assert(decoder.decode(delta));assert.equal(new SnapshotDecoder().decode(delta),null,'missing baseline requests resync');
 freezeSurface(surfaces[0]);full.surfaces=networkSnapshot().surfaces;const iced=encoder.encode(full);assert(iced.meta.surfaces[0].frozen,'scene revision carries permanent ice');
 const p=players[0];knockDown(p);beginRagdoll(p);assert(networkSnapshot().players[0].pose,'ragdoll bones still transmitted');
 console.log('Steady 10-player packet:',bytes,'bytes (previous diagnostic ~22326 bytes)');

 function predictScenario(fps,platformType=null){
  clean();makeMap(0);resetPlayers(6);phase='race';practiceMode=false;raceTime=0;
  const floor=addSurface('platform',30,30,0,0,90,25,true);
  const ground=platformType?addSurface(platformType,20,30,4):floor;
  const original=players[0];resetCombat(original);Object.assign(original,{x:20,y:ground.y+.002,z:30,vx:0,vy:0,vz:0,ground,netAck:0,netActions:{jump:0,dive:0,punch:0}});
  const host={...original,plan:[],netActions:{...original.netActions}};
  const state=()=>{const v={i:0,actionAck:{...host.netActions},ground:host.ground?.id??null};for(const k of NETWORK_FIELDS)v[k]=host[k];return v;};
  const predictor=new LocalPredictor(predictStep,predictionReference);predictor.reconcile(state(),0,makePredictedActor);
  const uplink=[],downlink=[],commands=[];let sent=0,maxCorrection=0,budget=0,clock=0,immediate=false;
  const actions={jump:0,dive:0,punch:0};
  for(let frame=1;frame<=fps*6;frame++){
   const now=frame/fps;raceTime=now;
   if(!platformType&&frame===fps)actions.jump++;
   if(!platformType&&frame===fps*2)actions.dive++;
   const input={x:platformType?0:now<1.5?1:now<2.2?-1:0,z:0,jump:now>=1&&now<1.18,grab:false,actions};
   const generated=predictor.advance(1/fps,input,true);
   if(!platformType&&now<.05&&predictor.actor.x>20.001)immediate=true;
   for(const c of generated)uplink.push({at:now+.075+.02*(1+Math.sin(c.seq)),c});
   // WebSocket is ordered even when the timing varies.
   while(uplink[0]?.at<=now)commands.push(uplink.shift().c);
   budget=Math.min(.15,budget+1/fps);
   const oldClock=clock;clock=now;movers.pose(now);
   if(isMoving(host.ground))movers.carry(host,host.ground,movingPosition(host.ground,now).sub(movingPosition(host.ground,oldClock)));
   while(commands.length&&budget>=STEP){
    const c=commands.shift();move(host,STEP,applyNetworkCommand(host,c));host.netAck=c.seq;budget-=STEP;updateCombat([host],STEP);
   }
   if(now-sent>=.05-1e-8){sent=now;downlink.push({at:now+.075+.02*(1+Math.cos(frame)),time:now,data:state()});}
   while(downlink[0]?.at<=now){const packet=downlink.shift();predictor.reconcile(packet.data,packet.time,makePredictedActor);maxCorrection=Math.max(maxCorrection,Math.hypot(...Object.values(predictor.error)));}
  }
  assert(platformType||immediate,'local movement reacts before 150ms round trip');
  assert(predictor.pending.length<22,'acknowledgements bound replay history');
  assert(Math.hypot(predictor.actor.x-host.x,predictor.actor.z-host.z)<.15,'stopped actor converges to authority');
  assert(maxCorrection<.7,'normal corrections remain small: '+maxCorrection+' '+fps+' '+platformType);
  if(platformType)assert.equal(predictor.actor.ground,ground,'predicted rider stays on moving disk');
  console.log('Prediction:',fps,'FPS',platformType||'jump/dive/turn','max correction',maxCorrection.toFixed(3),'m');
 }
 for(const fps of [30,60,120])predictScenario(fps);
 predictScenario(60,'movingHorizontal');predictScenario(60,'movingVertical');

 clean();makeMap(0);resetPlayers(6);phase='race';round=1;
 const sent=[],remote=players[1];net={online:true,running:true,isHost:true,isGuest:false,slot:0,inputs:new Map(),room:{members:players.map((p,i)=>({human:i<2,name:p.name}))}};
 remote.netActions={jump:0,dive:0,punch:0};remote.netAck=0;
 net.inputs.set(1,{x:1,z:0,jump:false,grab:false,received:performance.now(),sequenced:true,round:1,commands:[{seq:1,x:1,z:0,jump:false,actions:{jump:1}},{seq:2,x:1,z:0,jump:false,actions:{jump:1}}]});
 const first=raceInput(remote,STEP*2);assert(first.jumpPressed,'tap survives released jump key');assert.equal(remote.netMoves.length,2);
 for(const [i,c] of remote.netMoves.entries()){move(remote,STEP,i?applyNetworkCommand(remote,c):first);remote.netAck=c.seq;}
 assert.equal(remote.netAck,2);assert(remote.vy>0);assert.equal(remote.netActions.jump,1);
 net.inputs.get(1).commands.push({seq:2,x:1,z:0,jump:true,actions:{jump:1}});raceInput(remote,STEP);assert.equal(remote.netMoves.length,0,'duplicate input never replays');
 net.room.members[1].human=false;raceInput(remote,STEP);assert.equal(remote.netMoves,null,'AI takeover cannot retain an empty remote command queue');
 net=null;

 // Guests cannot award points or apply speculative attacks to other players.
 const authorityProbe=localPlayer(),score=authorityProbe.score;predictionPass=true;die(authorityProbe,'test');predictionPass=false;
 assert.equal(authorityProbe.score,score);assert(authorityProbe.alive);
 console.log('PASS: compact scene revisions/poses, buffered timeline, prediction with 150ms RTT plus jitter, jumps/dives, moving supports, convergence and authority guard');
`);
