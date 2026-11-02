import * as T from './three.module.js';

// Small motor-driven angular bodies. Only these three joints are simulated;
// the animated torso and gameplay capsule remain the authoritative anchors.
const JOINTS=[
  {name:'Head',stiffness:52,damping:7.6,limit:.26,lever:.36},
  {name:'ShoulderL',stiffness:78,damping:9.2,limit:.15,lever:-.23},
  {name:'ShoulderR',stiffness:78,damping:9.2,limit:.15,lever:-.23},
];

function rotationVector(q,out){
  const sign=q.w<0?-1:1,length=Math.hypot(q.x,q.y,q.z);
  return length<1e-8?out.set(0,0,0):out.set(q.x,q.y,q.z).multiplyScalar(sign*2*Math.atan2(length,Math.abs(q.w))/length);
}

function constrain(body,target,limit){
  const delta=body.q.clone().multiply(target.clone().invert()).normalize();
  const error=rotationVector(delta,new T.Vector3()),angle=error.length();
  if(angle<=limit)return;
  body.q.copy(target.clone().slerp(body.q,limit/angle)).normalize();
  error.divideScalar(angle);
  const outward=body.velocity.dot(error);
  if(outward>0)body.velocity.addScaledVector(error,-outward);
}

export class SecondaryMotion {
  constructor(){
    this.joints=new Map();this.rootPosition=new T.Vector3();
    this.rootRotation=new T.Quaternion();this.lastVelocity=new T.Vector3();this.initialized=false;
  }
  reset(){this.joints.clear();this.initialized=false;}
  apply(p,rig,dt,blocked=false){
    if(blocked||dt<=0||dt>.1){this.reset();return;}
    p.mesh.updateMatrixWorld(true);
    const rootPosition=p.mesh.getWorldPosition(new T.Vector3()),rootRotation=p.mesh.getWorldQuaternion(new T.Quaternion());
    const velocity=new T.Vector3((p.vx||0)+(p.impulseX||0),(p.vy||0),(p.vz||0)+(p.impulseZ||0));
    if(this.initialized&&(rootPosition.distanceTo(this.rootPosition)>2||rootRotation.angleTo(this.rootRotation)>1.1))this.reset();
    // Preserve the speed change as an impulse: clamping acceleration per frame
    // made sudden stops almost disappear at high FPS. Bound the total change
    // instead, then distribute it over the angular integration substeps.
    const velocityChange=this.initialized?velocity.clone().sub(this.lastVelocity).clampLength(0,8):new T.Vector3();
    this.rootPosition.copy(rootPosition);this.rootRotation.copy(rootRotation);this.lastVelocity.copy(velocity);this.initialized=true;
    const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
    for(const config of JOINTS){
      const bone=rig.bones.get(config.name);if(!bone)continue;
      const target=bone.getWorldQuaternion(new T.Quaternion());
      let body=this.joints.get(config.name);
      if(!body){body={q:target.clone(),target:target.clone(),velocity:new T.Vector3()};this.joints.set(config.name,body);}
      const inertia=new T.Vector3(-velocityChange.z,0,velocityChange.x).multiplyScalar(config.lever/steps);
      const error=new T.Vector3(),increment=new T.Quaternion();
      for(let i=0;i<steps;i++){
        const rest=body.target.clone().slerp(target,(i+1)/steps);
        rotationVector(rest.clone().multiply(body.q.clone().invert()).normalize(),error);
        body.velocity.addScaledVector(error,config.stiffness*h).add(inertia).multiplyScalar(Math.exp(-config.damping*h));
        const speed=body.velocity.length();
        if(speed>1e-8){increment.setFromAxisAngle(body.velocity.clone().divideScalar(speed),speed*h);body.q.premultiply(increment).normalize();}
        constrain(body,rest,config.limit);
      }
      constrain(body,target,config.limit);body.target.copy(target);
      if(!rig.offsets.some(([other])=>other===bone))rig.offsets.push([bone,bone.quaternion.clone()]);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(body.q));
      bone.updateMatrixWorld(true);
    }
  }
}
