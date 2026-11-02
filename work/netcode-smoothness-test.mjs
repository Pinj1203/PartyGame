import assert from 'node:assert/strict';
import {PacketCadence,SnapshotTimeline,LocalPredictor,STEP} from '../dist/netcode.js';
import {run} from './harness.mjs';

// Includes the worker's ~16ms callbacks, which formerly rounded 50ms up to 64ms.
for(const frameMs of [16,1000/30,1000/60,1000/120,1000/144])for(const rate of [20,30]){
 const cadence=new PacketCadence(1000/rate),sent=[];
 for(let frame=0;frame*frameMs<10000;frame++)if(cadence.due(frame*frameMs)){sent.push(frame*frameMs);cadence.sent(frame*frameMs);}
 assert(Math.abs(sent.length-rate*10)<=1,`${rate} Hz cadence at ${frameMs} ms frames: ${sent.length}`);
 const afterStall=20000;assert(cadence.due(afterStall));cadence.sent(afterStall);assert(!cadence.due(afterStall+.1),'no burst after suspended tab');
}

// Continuous display motion at refresh rates that do not divide the physics tick.
for(const fps of [60,90,120,144,165,240]){
 const predictor=new LocalPredictor((p,c,dt)=>{p.x+=4*dt;});
 predictor.reconcile({x:0,y:0,z:0,facing:0,alive:true,hitSerial:0,netAck:0},0,s=>({...s}));
 let previous=null,maxError=0,repeats=0;
 for(let i=1;i<=fps*3;i++){
  predictor.advance(1/fps,{actions:{}});
  const displayed=predictor.render();
  if(i>fps&&previous){maxError=Math.max(maxError,Math.abs(displayed.x-previous.x-4/fps));if(displayed.x===previous.x)repeats++;}
  previous=displayed;
 }
 assert.equal(repeats,0,`${fps} FPS does not repeat fixed-tick positions`);
 assert(maxError<1e-8,'constant-speed render interpolation');
 const before=predictor.render().x;
 predictor.reconcile({...predictor.actor,x:predictor.actor.x-.2,netAck:predictor.sequence},predictor.time,s=>({...s}));
 assert(Math.abs(predictor.render().x-before)<1e-8,'acknowledgement correction has no visual snap');
}

{
 const predictor=new LocalPredictor((p,c,dt)=>{p.x+=2*dt;},(p,time)=>({key:1,x:2*time,y:0,z:0}));
 predictor.reconcile({x:0,y:0,z:0,facing:0,alive:true,hitSerial:0,netAck:0},0,s=>({...s}));
 for(let i=0;i<120;i++)predictor.advance(STEP/2,{actions:{}});
 predictor.reconcile({...predictor.actor,x:predictor.actor.x+.3,netAck:predictor.sequence},predictor.time+.15,s=>({...s}));
 assert(Math.abs(predictor.error.x)<1e-8,'support clock correction is not misclassified as player position error');
 predictor.reconcile({...predictor.actor,x:predictor.actor.x+.2,netAck:predictor.sequence},predictor.time,s=>({...s}));
 assert(Math.abs(predictor.error.x+.2)<1e-8,'real movement error on a support is still smoothed');
}

for(const fps of [30,60,120,144]){
 const timeline=new SnapshotTimeline(),packets=[];
 for(let i=0;i<300;i++){
  // Ordered delivery, ordinary jitter, periodic 80ms late packet and one lost snapshot.
  if(i%39===20)continue;
  const sent=i*.05,arrival=sent+.075+(i%41===17?.08:(Math.sin(i*4.7)+1)*.015);
  packets.push({arrival:Math.max(arrival,packets.at(-1)?.arrival??0),state:{seq:i+1,match:1,round:1,phase:'race',raceTime:sent}});
 }
 let previous=null,freezes=0,maxSpeedError=0;
 for(let frame=0;frame<fps*14;frame++){
  const now=frame/fps;
  while(packets[0]?.arrival<=now){const p=packets.shift();timeline.push(p.state,p.arrival);}
  const sample=timeline.sample(1/fps,now);if(!sample)continue;
  if(now>2&&previous!=null){const speed=(sample.time-previous)*fps;if(speed<.01)freezes++;maxSpeedError=Math.max(maxSpeedError,Math.abs(speed-1));}
  previous=sample.time;
 }
 assert.equal(freezes,0,`jitter buffer does not stop/start at ${fps} FPS`);
 assert(maxSpeedError<=.04001,`world clock speed correction stays within 4%: ${maxSpeedError}`);
}

run(`
 clean();makeMap(0);resetPlayers(6);
 const far=addSurface('movingHorizontal',100,80,3),s=addSurface('platform',20,0,0,0,4,4);
 const entry=collisionWorld.entries.get(s)[0],farEntry=collisionWorld.entries.get(far)[0];
 collisionWorld.candidates(new T.Vector3(20,-.1,0),new T.Vector3(20,1,0),.36);
 assert(entry.triangles?.length>0);assert.equal(farEntry.triangles,null,'distant meshes do not build world triangles');
 const triangles=entry.triangles,triangle=triangles[0].tri;
 s.mesh.position.y=5;updateSolidBounds(s);
 assert.equal(entry.triangles,triangles,'reuse cached triangle storage after movement');
 assert.equal(collisionWorld.candidates(new T.Vector3(20,-.1,0),new T.Vector3(20,1,0),.36).length,0,'old location has no stale collision');
 // A render-only pose must not change the stored physical collision transform.
 s.mesh.position.y=30;s.mesh.updateMatrixWorld(true);
 const candidates=collisionWorld.candidates(new T.Vector3(20,4.9,0),new T.Vector3(20,6,0),.36);
 assert(candidates.length>0);assert.equal(entry.triangles[0].tri,triangle);
 assert(triangles.every(t=>t.bounds.max.y<6),'lazy triangles use physical transform rather than render transform');
 // Buffer geometry changes must invalidate the local triangle cache too.
 s.mesh.position.y=5;const attribute=entry.mesh.geometry.attributes.position;
 for(let i=0;i<attribute.count;i++)attribute.setY(i,attribute.getY(i)+2);attribute.needsUpdate=true;updateSolidBounds(s);
 assert(entry.bounds.min.y>6,'bounds update for modified geometry');
 assert(collisionWorld.candidates(new T.Vector3(20,6.9,0),new T.Vector3(20,8,0),.36).length>0);
 assert.notEqual(entry.triangles,triangles,'changed geometry rebuilds local cache');
`);
console.log('PASS: stable 20/30 Hz cadence, 60–240 FPS display interpolation, correction continuity, jitter/burst buffering and lazy accurate collision caches');
