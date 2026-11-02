import * as T from './three.module.js';
import {COURSE} from './island-map.js';

export const MOVING_TYPES=['movingHorizontal','movingVertical'];
export const MOVING={radius:2.4,height:.55,travel:COURSE.length/4,period:16};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const isMoving=s=>MOVING_TYPES.includes(typeof s==='string'?s:s?.type);

export function movingOffset(type,angle,time){
 const distance=MOVING.travel*(1-Math.cos(time*Math.PI*2/MOVING.period))/2;
 return type==='movingVertical'?V(0,distance,0):V(Math.cos(angle)*distance,0,-Math.sin(angle)*distance);
}
export function movingPosition(s,time){
 const origin=s.motionOrigin??s;
 return V(origin.x,origin.y,origin.z).add(movingOffset(s.type,s.angle,time));
}
export function movingBounds(type){
 const {radius:r,height:h,travel}=MOVING;
 return new T.Box3(V(-r,-h,-r),type==='movingVertical'?V(r,travel,r):V(travel+r,0,r));
}
export function createMovingPlatform(type){
 const g=new T.Group(),color=type==='movingVertical'?0xb09ee8:0x75ced0;
 const deck=new T.Mesh(new T.CylinderGeometry(MOVING.radius,MOVING.radius,MOVING.height,48),new T.MeshStandardMaterial({color,roughness:.65}));
 deck.position.y=-MOVING.height/2;deck.name='moving-platform-deck';g.add(deck);
 // Markings are visual only; the circular deck is the complete solid shape.
 const ring=new T.Mesh(new T.TorusGeometry(MOVING.radius-.15,.025,6,48),new T.MeshStandardMaterial({color:0xf9f5da}));
 ring.rotation.x=Math.PI/2;ring.position.y=.006;ring.userData.effect=true;g.add(ring);
 const arrow=new T.Mesh(new T.ConeGeometry(.3,.8,3),new T.MeshStandardMaterial({color:0xf9f5da}));
 arrow.rotation.set(Math.PI/2,0,-Math.PI/2);arrow.scale.z=.03;arrow.position.y=.025;arrow.userData.effect=true;g.add(arrow);
 return g;
}
export function addMovingPreview(g,type){
 const end=type==='movingVertical'?V(0,MOVING.travel,0):V(MOVING.travel,0,0);
 const material=new T.LineDashedMaterial({color:0x72d485,dashSize:.6,gapSize:.35,transparent:true,opacity:.9,depthWrite:false});
 const line=new T.Line(new T.BufferGeometry().setFromPoints([V(0,.04,0),end.clone().add(V(0,.04,0))]),material);
 line.computeLineDistances();line.name='movement-path';line.userData.effect=true;g.add(line);
 for(let i=1;i<=4;i++){
  const ring=new T.Mesh(new T.TorusGeometry(MOVING.radius,.035,6,48),new T.MeshBasicMaterial({color:0x72d485,transparent:true,opacity:i===4?.85:.3,depthWrite:false}));
  ring.rotation.x=Math.PI/2;ring.position.copy(end).multiplyScalar(i/4);ring.position.y+=.02;ring.userData.effect=true;ring.name=i===4?'movement-endpoint':'movement-waypoint';g.add(ring);
 }
 g.userData.movingPreview=true;
}

export class MovingPlatforms{
 constructor({updateSolidBounds,collision,players}){this.platforms=[];this.updateSolidBounds=updateSolidBounds;this.collision=collision;this.players=players;this.time=0;}
 add(s){if(!isMoving(s))return;s.motionOrigin={x:s.x,y:s.y,z:s.z};s.motionVelocity=V();this.platforms.push(s);}
 pose(time,carry=false,physical=true){
  const dt=time-this.time;
  for(const s of this.platforms){
   const next=movingPosition(s,time),delta=next.clone().sub(V(s.x,s.y,s.z));
   if(!physical){s.mesh.position.copy(next);s.mesh.updateMatrixWorld(true);continue;}
   s.motionVelocity.copy(delta).multiplyScalar(dt>0?1/dt:0);
   Object.assign(s,{x:next.x,y:next.y,z:next.z});s.mesh.position.copy(next);this.updateSolidBounds(s);
   if(carry&&dt>0)for(const p of this.players())if(p.alive&&!p.finished&&p.ground===s)this.carry(p,s,delta);
  }
  if(physical)this.time=time;
 }
 reset(){this.pose(0);}
 carry(p,s,delta){
  if(p.ragdoll?.active){
   for(const n of p.ragdoll.nodes.values()){n.p.add(delta);n.prev.add(delta);}
   p.ragdoll.core.center.add(delta);
   if(p.ragdoll.support?.surface===s)p.ragdoll.support.point.add(delta);
   p.x+=delta.x;p.y+=delta.y;p.z+=delta.z;
   return;
  }
  // Sweep the rider too, so overhanging walls/ceilings cannot be crossed.
  const tilt=(p.divePose||0)*1.45,half=(1.45-.72)/2,reach=half*Math.sin(tilt),fx=Math.cos(p.diveYaw||0),fz=Math.sin(p.diveYaw||0);
  const low=V(-fx*reach,.36,-fz*reach),high=V(fx*reach,.36+2*half*Math.cos(tilt),fz*reach);
  const position=V(p.x,p.y,p.z),steps=Math.max(1,Math.ceil(delta.length()/.1)),step=delta.clone().divideScalar(steps);
  for(let i=0;i<steps;i++){
   position.add(step);const bottom=position.clone().add(low),top=position.clone().add(high);
   this.collision.capsule(bottom,top,.36,3,s);position.copy(bottom).sub(low);
  }
  p.x=position.x;p.y=position.y;p.z=position.z;
 }
}
