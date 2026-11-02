import assert from 'node:assert/strict';
import * as T from '../dist/three.module.js';
import {SecondaryMotion} from '../dist/secondary-motion.js';
import {run} from './harness.mjs';

function fixture(){
 const mesh=new T.Group(),torso=new T.Bone();torso.name='Torso';mesh.add(torso);
 const bones=new Map([['Torso',torso]]);
 for(const [name,x,y] of [['Head',0,1.3],['ShoulderL',-.3,.9],['ShoulderR',.3,.9]]){
  const bone=new T.Bone();bone.name=name;bone.position.set(x,y,0);torso.add(bone);bones.set(name,bone);
 }
 return {p:{mesh,vx:0,vy:0,vz:0},rig:{bones,offsets:[]},motion:new SecondaryMotion()};
}
function step(f,dt,heading){
 for(const [bone,q] of f.rig.offsets)bone.quaternion.copy(q);f.rig.offsets.length=0;
 f.p.mesh.rotation.y=-heading;f.motion.apply(f.p,f.rig,dt);f.p.mesh.updateMatrixWorld(true);
}
for(const fps of [30,60,120]){
 const f=fixture();let headPeak=0,shoulderPeak=0,rebound=false;
 for(let i=0;i<fps*3;i++){
  const time=i/fps,heading=time<.1?0:time<.3?Math.PI/2*(1-Math.exp(-30*(time-.1))):Math.PI/2;
  step(f,1/fps,heading);
  for(const [name,body] of f.motion.joints){
   const deviation=body.q.angleTo(body.target);
   assert(deviation<=(name==='Head'?.26:.15)+1e-6,'bounded angular joint '+name);
   assert(Number.isFinite(body.q.w)&&body.velocity.length()<30);
   if(name==='Head'){
    headPeak=Math.max(headPeak,deviation);
    const relative=body.q.clone().multiply(body.target.clone().invert());
    if(time>.4&&relative.y<-.001)rebound=true;
   }else shoulderPeak=Math.max(shoulderPeak,deviation);
  }
  assert.equal(f.rig.bones.get('Torso').quaternion.angleTo(new T.Quaternion()),0,'torso never receives secondary motion');
 }
 assert(headPeak>.18&&shoulderPeak>.10&&headPeak>shoulderPeak,'head and shoulder motion is visible but small');
 assert(rebound,'head has a small physical follow-through');
 for(const body of f.motion.joints.values())assert(body.q.angleTo(body.target)<.0001,'resting joints settle without an idle sway loop');
 const fixed=f.rig.bones.get('Head').position.clone();
 for(let i=0;i<fps*4;i++)step(f,1/fps,Math.sin(i/fps*9));
 assert(f.rig.bones.get('Head').position.distanceTo(fixed)<1e-10,'head stays attached');
}
{
 const f=fixture();step(f,1/60,Math.PI-.01);step(f,1/60,-Math.PI+.01);
 assert(f.motion.joints.get('Head').q.angleTo(f.motion.joints.get('Head').target)<.021,'heading wraps use the shortest arc');
 f.p.vx=4;step(f,1/60,-Math.PI+.01);
 assert(f.motion.joints.get('Head').velocity.length()>.01,'body acceleration drives joint inertia');
 f.p.mesh.position.x=100;step(f,1/60,0);
 for(const body of f.motion.joints.values())assert(body.q.angleTo(body.target)<1e-6,'teleports rebase joint bodies');
 step(f,.5,.4);assert.equal(f.motion.joints.size,0,'long pause clears inertia');
}


// A genuine stop preserves its momentum at all display rates; gradual braking
// gives the joints time to follow, and should produce a much smaller sway.
const stopPeaks=[];
function brakingSample(fps,seconds){
 const f=fixture();f.p.vx=7;step(f,1/fps,0);
 let headPeak=0,shoulderPeak=0,forward=false,rebound=false;
 for(let i=0;i<fps*3;i++){
  const time=i/fps;f.p.vx=seconds?7*Math.max(0,1-time/seconds):0;step(f,1/fps,0);
  const head=f.motion.joints.get('Head'),shoulder=f.motion.joints.get('ShoulderL');
  headPeak=Math.max(headPeak,head.q.angleTo(head.target));shoulderPeak=Math.max(shoulderPeak,shoulder.q.angleTo(shoulder.target));
  if(head.q.z<-.02)forward=true;if(time>.4&&head.q.z>.002)rebound=true;
 }
 for(const body of f.motion.joints.values())assert(body.q.angleTo(body.target)<.001,'stop sway settles');
 return {headPeak,shoulderPeak,forward,rebound};
}
for(const fps of [30,60,120]){
 const abrupt=brakingSample(fps,0),gentle=brakingSample(fps,1);
 assert(abrupt.headPeak>.13&&abrupt.headPeak<.261,'visible but bounded stop head sway '+JSON.stringify(abrupt));
 assert(abrupt.shoulderPeak>.06&&abrupt.shoulderPeak<.151,'visible stop shoulder follow-through');
 assert(abrupt.forward&&abrupt.rebound,'head tips forward at a stop and swings back');
 assert(abrupt.headPeak>gentle.headPeak*1.8,'sudden stop has more inertia than gradual braking');
 stopPeaks.push(abrupt.headPeak);
}
assert(Math.max(...stopPeaks)-Math.min(...stopPeaks)<.02,'sudden-stop strength is consistent at 30/60/120 FPS');

run(`
 clean();makeMap();resetPlayers(6);phase='race';
 const a=players[0],b=players[1],rig=p=>p.mesh.userData.animal;
 const simulated=new Set(['Head','ShoulderL','ShoulderR']);
 function reset(p){
  resetCombat(p);resetAnimal(p.mesh);rig(p).mixer.setTime(0);
  Object.assign(p,{x:0,y:0,z:0,vx:4,vy:0,vz:0,ground:surfaces[0],facing:0});
  p.mesh.position.set(0,0,0);p.mesh.rotation.set(0,0,0);
 }
 function frame(p,dt,facing,reference=false,speed=4){
  p.facing=facing;p.mesh.rotation.y=-facing;p.vx=speed*Math.cos(facing);p.vz=speed*Math.sin(facing);
  if(reference)rig(p).secondaryMotion.reset();
  const physical=[p.x,p.y,p.z,p.vx,p.vy,p.vz,p.facing,p.attackYaw,p.grabYaw];
  const rootPose=[...p.mesh.position.toArray(),...p.mesh.quaternion.toArray()];
  animateAnimal(p,dt);p.mesh.updateMatrixWorld(true);
  assert.deepEqual([p.x,p.y,p.z,p.vx,p.vy,p.vz,p.facing,p.attackYaw,p.grabYaw],physical);
  assert.deepEqual([...p.mesh.position.toArray(),...p.mesh.quaternion.toArray()],rootPose);
 }
 const jointWorld=(p,name)=>rig(p).bones.get(name).getWorldPosition(new T.Vector3());
 function compare(all=false){
  for(const [name,bone] of rig(a).bones){
   const reference=rig(b).bones.get(name);
   assert(bone.position.distanceTo(reference.position)<1e-6,'no translated joints '+name);
   assert(bone.scale.distanceTo(reference.scale)<1e-6,'no stretched joints '+name);
   if(all||!simulated.has(name))assert(bone.quaternion.clone().normalize().angleTo(reference.quaternion.clone().normalize())<1e-5,'only head/shoulders may rotate: '+name);
  }
  for(const name of all?[...rig(a).bones.keys()]:['Body','Hips','Abdomen','Torso','Neck','UpperLegL','UpperLegR','FootL','FootR','Head','ShoulderL','ShoulderR'])assert(jointWorld(a,name).distanceTo(jointWorld(b,name))<1e-5,'joint anchor stays attached: '+name);
 }
 for(const fps of [30,60,120])for(const air of [false,true]){
  reset(a);reset(b);if(air)a.ground=b.ground=null;
  for(let i=0;i<fps;i++){frame(a,1/fps,Math.sin(i/fps*6));frame(b,1/fps,Math.sin(i/fps*6),true);compare();}
 }
 const modes=[
  p=>{p.punchSerial=1;p.punchTime=COMBAT.windup;},p=>{p.punchSerial=2;p.punchTime=COMBAT.windup;},
  p=>{p.grabIntent=true;},p=>{p.grabbing=2;p.grabFacingLocked=true;},p=>{p.grabbing=2;p.grabFacingLocked=false;},
  p=>{p.grabbedBy=2;},p=>{p.diving=true;p.divePose=.8;},p=>{p.getUpTime=.3;},
 ];
 for(const trigger of ['turn','stop'])for(const mode of modes){
  reset(a);reset(b);
  for(let i=0;i<12;i++){const heading=trigger==='turn'?i*.12:0,speed=trigger==='turn'?4:7;frame(a,1/60,heading,false,speed);frame(b,1/60,heading,true,speed);}
  if(trigger==='stop')for(let i=0;i<6;i++){frame(a,1/60,0,false,0);frame(b,1/60,0,true,0);}
  assert(rig(a).secondaryMotion.joints.get('Head').q.angleTo(rig(a).secondaryMotion.joints.get('Head').target)>.04);
  mode(a);mode(b);
  for(let i=0;i<8;i++){const heading=trigger==='turn'?1.32+i*.1:0,speed=trigger==='turn'?4:0;frame(a,1/60,heading,false,speed);frame(b,1/60,heading,true,speed);compare(true);}
  assert.equal(rig(a).secondaryMotion.joints.size,0,'combat clears all secondary joint momentum');
 }
 resetAnimal(a.mesh);assert.equal(rig(a).secondaryMotion.joints.size,0);
 console.log('PASS: stronger head/shoulder turn and stop inertia only, unchanged spine/legs and gameplay, fixed anchors/lengths, bounded joints, 30/60/120 FPS, grounded/airborne, reset/teleport, and exact punch/grab/dive/recovery priority');
`);
