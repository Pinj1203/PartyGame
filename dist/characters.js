import * as T from './three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { clone } from './vendor/utils/SkeletonUtils.js';
import { applyRagdollPose, captureRagdollMotion } from './ragdoll.js';
import { COMBAT } from './combat.js';
import { SecondaryMotion } from './secondary-motion.js';

let template;
export async function loadCharacters(source) {
  const loader = new GLTFLoader();
  template = source ? await loader.parseAsync(source, '') :
    await loader.loadAsync(new URL('./assets/characters/bunny.gltf', import.meta.url).href);
  return template;
}

function spring(s, target, stiffness, damping, dt) {
  const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += ((target - s.x) * stiffness - s.v * damping) * h;
    s.x += s.v * h;
  }
  s.x = T.MathUtils.clamp(s.x, -1.0, 1.0);
  return s.x;
}

export function createAnimal(color) {
  if (!template) throw new Error('Character asset has not loaded');
  const root = new T.Group(), bodyPivot = new T.Group(), animal = clone(template.scene);
  root.add(bodyPivot); bodyPivot.add(animal);
  const grabRing=new T.Mesh(new T.TorusGeometry(.53,.025,6,48),
    new T.MeshBasicMaterial({color:0xffb765,transparent:true,opacity:.9,depthWrite:false}));
  grabRing.rotation.x=-Math.PI/2;grabRing.position.y=.045;grabRing.visible=false;root.add(grabRing);
  bodyPivot.position.y = .72;
  animal.rotation.y = Math.PI / 2; // Asset faces +Z; gameplay forward is +X.
  animal.scale.setScalar(.55);
  animal.position.y = -.72;
  const materials = new Map(), bones = new Map();
  animal.traverse(o => {
    if (o.isBone) bones.set(o.name, o);
    if (!o.isMesh) return;
    // Each character owns its GPU resources: a restart cannot dispose the template.
    o.geometry = o.geometry.clone();
    const remap = m => {
      if (!materials.has(m)) {
        const copy = m.clone();
        copy.roughness = .83; copy.metalness = 0;
        copy.side = T.FrontSide;
        if (m.name === 'Main') copy.color.setHex(color);
        if (m.name === 'Main2') copy.color.setHex(color).lerp(new T.Color(0xfff4dd), .7);
        materials.set(m, copy);
      }
      return materials.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(remap) : remap(o.material);
    o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
  });
  const mixer = new T.AnimationMixer(animal), actions = new Map();
  for (const clip of template.animations) if(clip.name!=='Death')actions.set(clip.name, mixer.clipAction(clip));
  const state = {
    animal, bodyPivot, grabRing, mixer, actions, bones, materials: [...materials.values()],
    action: '', grabWeight:0, recovery:null, recoveryBase:[],
    punchSerial: 0, hitSerial: 0, lastVX: 0, lastVZ: 0, wasGrounded: true,
    lean: {x:0,v:0}, roll: {x:0,v:0}, squash: {x:0,v:0}, ears: {x:0,v:0},
    offsets: [], positionOffsets: [], feet: new Map(), time: 0,
    stridePhase: 0, strideForward: 0, strideSide: 0, strideWeight: 0,
    secondaryMotion: new SecondaryMotion(),ragdollMotion:null,
  };
  root.userData.animal = state;
  root.userData.dispose = () => {
    mixer.stopAllAction(); mixer.uncacheRoot(animal);
    const skeletons = new Set();
    animal.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
    skeletons.forEach(s=>s.dispose());
  };
  setAction(state, 'Idle');
  mixer.update(0);
  root.updateMatrixWorld(true);
  for(const side of ['L','R']){
    const foot=bones.get('Foot'+side),shin=bones.get('LowerLeg'+side);
    const point=foot.getWorldPosition(new T.Vector3());
    state.feet.set(side,{home:root.worldToLocal(point.clone()),ankle:shin.worldToLocal(point.clone())});
  }
  return root;
}

function setAction(s, name, speed = 1, restart = false) {
  if (s.action === name && !restart) { s.actions.get(name)?.setEffectiveTimeScale(speed); return; }
  const action = s.actions.get(name);
  if (!action) return;
  const previous = s.actions.get(s.action);
  action.reset().setEffectiveTimeScale(speed).setEffectiveWeight(1);
  if (speed<0) action.time=action.getClip().duration;
  const once = ['Punch', 'HitReact', 'Jump_Land', 'Death', 'GetUp'].includes(name);
  action.setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity);
  action.clampWhenFinished = once;
  action.play();
  if (previous && previous !== action) { previous.fadeOut(.1); action.fadeIn(.1); }
  s.action = name;
}

export function resetAnimal(root) {
  const s = root.userData.animal;
  if (!s) return;
  for (const [bone, q] of s.offsets) bone.quaternion.copy(q);
  s.offsets.length = 0;
  for(const [bone,pos] of s.positionOffsets)bone.position.copy(pos);
  s.positionOffsets.length=0;
  for(const [bone,pos,q] of s.recoveryBase){bone.position.copy(pos);bone.quaternion.copy(q);}
  s.recoveryBase.length=0;s.recovery=null;s.grabWeight=0;
  for (const key of ['lean','roll','squash','ears']) Object.assign(s[key],{x:0,v:0});
  Object.assign(s,{punchSerial:0,hitSerial:0,lastVX:0,lastVZ:0,wasGrounded:true,
    stridePhase:0,strideForward:0,strideSide:0,strideWeight:0});
  s.secondaryMotion.reset();s.ragdollMotion=null;
  s.bodyPivot.rotation.set(0,0,0); s.bodyPivot.scale.set(1,1,1);s.bodyPivot.position.y=.72;
  s.grabRing.visible=false;
  s.mixer.stopAllAction(); s.action=''; setAction(s,'Idle');
}

function addBoneOffset(s, name, x, z) {
  const bone = s.bones.get(name);
  if (!bone) return;
  if(!s.offsets.some(([other])=>other===bone))s.offsets.push([bone, bone.quaternion.clone()]);
  bone.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(x, 0, z)));
}

function aimBone(s,bone,end,target,weight){
  if(!bone||!end)return;
  const start=bone.getWorldPosition(new T.Vector3());
  const from=(end.isVector3?end.clone():end.getWorldPosition(new T.Vector3())).sub(start).normalize();
  const to=target.clone().sub(start).normalize();
  const world=bone.getWorldQuaternion(new T.Quaternion());
  world.premultiply(new T.Quaternion().setFromUnitVectors(from,to));
  const local=bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world);
  if(!s.offsets.some(([b])=>b===bone))s.offsets.push([bone,bone.quaternion.clone()]);
  bone.quaternion.slerp(local,weight);bone.updateMatrixWorld(true);
}

function directionalSteps(p,s,dt){
  const grounded=!!p.ground&&!p.getUpTime&&!p.diving&&!p.diveRecovery;
  const holding=(p.grabbing!=null&&p.grabFacingLocked||p.grabbedBy!=null)&&grounded;
  const rate=p.grabbedBy!=null?COMBAT.grabbedAnimationRate:COMBAT.grabAnimationRate;
  const c=Math.cos(p.facing),sn=Math.sin(p.facing);
  const vx=(p.vx||0)+(p.grabVelocityX||0),vz=(p.vz||0)+(p.grabVelocityZ||0);
  const speed=Math.hypot(vx,vz);
  // Movement is expressed in the locked body's local axes, not camera axes.
  s.strideForward=T.MathUtils.damp(s.strideForward,holding?(vx*c+vz*sn)/Math.max(1,speed):0,18,dt);
  s.strideSide=T.MathUtils.damp(s.strideSide,holding?(-vx*sn+vz*c)/Math.max(1,speed):0,18,dt);
  s.strideWeight=T.MathUtils.damp(s.strideWeight,holding?Math.min(1,speed/1.2):0,18,dt);
  if(!grounded||s.strideWeight<.001)return;
  s.stridePhase=(s.stridePhase+dt*(1.8+speed*.38)*rate*Math.PI*2)%(Math.PI*2);
  p.mesh.updateMatrixWorld(true);
  const forward=new T.Vector3(c,0,sn);
  for(const side of ['L','R']){
    const upper=s.bones.get('UpperLeg'+side),lower=s.bones.get('LowerLeg'+side),foot=s.bones.get('Foot'+side);
    const bind=s.feet.get(side),phase=s.stridePhase+(side==='R'?Math.PI:0);
    const stride=-Math.cos(phase)*.12;
    const target=bind.home.clone();
    target.x+=stride*s.strideForward;target.z+=stride*s.strideSide;
    target.y+=Math.max(0,Math.sin(phase))*.085;
    p.mesh.localToWorld(target);
    const hip=upper.getWorldPosition(new T.Vector3()),knee=lower.getWorldPosition(new T.Vector3());
    const ankle=lower.localToWorld(bind.ankle.clone()),l1=hip.distanceTo(knee),l2=knee.distanceTo(ankle);
    const direction=target.clone().sub(hip),distance=T.MathUtils.clamp(direction.length(),.04,l1+l2-.003);
    direction.normalize();target.copy(hip).addScaledVector(direction,distance);
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const bend=forward.clone().addScaledVector(direction,-forward.dot(direction)).normalize();
    const desiredKnee=hip.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    aimBone(s,upper,lower,desiredKnee,s.strideWeight);
    aimBone(s,lower,lower.localToWorld(bind.ankle.clone()),target,s.strideWeight);
    // This asset's feet are sibling controls, not shin children. Reattach each
    // to its fixed shin endpoint after IK; never stretch a bone to reach a step.
    s.positionOffsets.push([foot,foot.position.clone()]);
    foot.position.copy(foot.parent.worldToLocal(lower.localToWorld(bind.ankle.clone())));
    foot.updateMatrixWorld(true);
  }
}

function reachArms(p,s,weight){
  p.mesh.updateMatrixWorld(true);
  const forward=new T.Vector3(Math.cos(p.facing),0,Math.sin(p.facing));
  const right=new T.Vector3(-forward.z,0,forward.x);
  const center=p.divePose>0?new T.Vector3(p.x,p.y+.48,p.z).addScaledVector(forward,1.1):
    p.grabVisualTarget?.clone()??new T.Vector3(p.x,p.y+.68,p.z).addScaledVector(forward,.85);
  for(const side of ['L','R']){
    const upper=s.bones.get('UpperArm'+side),lower=s.bones.get('LowerArm'+side),hand=s.bones.get('Fist'+side);
    const shoulder=upper.getWorldPosition(new T.Vector3()),elbow=lower.getWorldPosition(new T.Vector3()),wrist=hand.getWorldPosition(new T.Vector3());
    const target=center.clone().addScaledVector(right,side==='L'?-.15:.15);
    const l1=shoulder.distanceTo(elbow),l2=elbow.distanceTo(wrist);
    const direction=target.clone().sub(shoulder),distance=T.MathUtils.clamp(direction.length(),.06,l1+l2-.005);
    direction.normalize();target.copy(shoulder).addScaledVector(direction,distance);
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const bend=new T.Vector3(0,-1,0).addScaledVector(right,side==='L'?-.3:.3);
    bend.addScaledVector(direction,-bend.dot(direction)).normalize();
    const desiredElbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    aimBone(s,upper,lower,desiredElbow,weight);
    aimBone(s,lower,hand,target,weight);
  }
}

function rotateBoneWorld(s,name,angle,axis){
  const bone=s.bones.get(name);if(!bone)return;
  if(!s.offsets.some(([b])=>b===bone))s.offsets.push([bone,bone.quaternion.clone()]);
  const rotation=new T.Quaternion().setFromAxisAngle(axis,angle);
  const world=bone.getWorldQuaternion(new T.Quaternion()).premultiply(rotation);
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
  bone.updateMatrixWorld(true);
}

function twistBone(s,name,angle){
  rotateBoneWorld(s,name,angle,new T.Vector3(0,1,0));
}

function secondaryMotion(p,s,dt,lobby){
  const busy=lobby||p.grabIntent||p.grabbing!=null||p.grabbedBy!=null||p.grabFacingLocked||s.grabWeight>.001||
    (p.punchTime>=0&&p.punchTime<=COMBAT.duration)||p.diving||p.diveRecovery>0||p.divePose>.001||p.downTime>0||p.getUpTime>0;
  s.secondaryMotion.apply(p,s,dt,busy);
}

// Explicit anticipation, contact, follow-through and recovery. The contact key
// uses the same clock as damage, so FPS and the original clip's timing cannot
// make the opponent react before the fist has extended.
function punchArms(p,s){
  if(p.punchTime<0||p.punchTime>COMBAT.duration||p.diving||p.diveRecovery||p.getUpTime)return;
  const frames=[
    [0,               .12,-.08,.33, 0,    0],
    [COMBAT.windup*.54,-.18,-.07,.55,-.32, 1],
    [COMBAT.windup,    .60,-.12,.52, .36, 1],
    [COMBAT.windup+.035,.63,-.12,.46,.40, 1],
    [COMBAT.duration*.59,.18,.00,.35,-.04,1],
    [COMBAT.duration,  .18, .02,.31, 0,    0],
  ];
  let a=frames[0],b=frames[1];
  for(let i=1;i<frames.length;i++){a=frames[i-1];b=frames[i];if(p.punchTime<=b[0])break;}
  const u=T.MathUtils.clamp((p.punchTime-a[0])/(b[0]-a[0]),0,1),ease=u*u*(3-2*u);
  const pose=a.map((value,i)=>T.MathUtils.lerp(value,b[i],ease));
  const weight=pose[5],striking=p.punchSerial%2?'R':'L',sign=striking==='R'?1:-1;
  p.mesh.updateMatrixWorld(true);
  twistBone(s,'Torso',sign*pose[4]*weight);
  twistBone(s,'Head',-sign*pose[4]*weight*.55);
  twistBone(s,'Shoulder'+striking,sign*pose[4]*weight*.35);
  for(const side of ['L','R']){
    const upper=s.bones.get('UpperArm'+side),lower=s.bones.get('LowerArm'+side),hand=s.bones.get('Fist'+side);
    const shoulder=upper.getWorldPosition(new T.Vector3()),elbow=lower.getWorldPosition(new T.Vector3()),wrist=hand.getWorldPosition(new T.Vector3());
    const ownSign=side==='R'?1:-1,active=side===striking;
    const height=p.mesh.worldToLocal(shoulder.clone()).y;
    // Keep the striking fist below and outside the oversized head's outline;
    // the player must be able to read the swing from the chase camera too.
    const target=p.mesh.localToWorld(new T.Vector3(active?pose[1]:.23,height+(active?pose[2]:.06),ownSign*(active?pose[3]:.28)));
    const l1=shoulder.distanceTo(elbow),l2=elbow.distanceTo(wrist);
    const direction=target.clone().sub(shoulder),distance=T.MathUtils.clamp(direction.length(),.04,l1+l2-.006);
    direction.normalize();target.copy(shoulder).addScaledVector(direction,distance);
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const bend=new T.Vector3(-.35,-.45,ownSign*.95).transformDirection(p.mesh.matrixWorld);
    bend.addScaledVector(direction,-bend.dot(direction)).normalize();
    const desiredElbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    // Rotate the two joints to reach the target. Never move/scale a bone or the
    // actor root: the legs, jump and body's physical capsule keep their motion.
    aimBone(s,upper,lower,desiredElbow,weight);
    aimBone(s,lower,hand,target,weight);
  }
}

export function animateAnimal(p, dt, lobby = false) {
  const s = p.mesh.userData.animal;
  if (!s) return;
  // Undo the previous additive pose before evaluating the next animation frame.
  for (const [bone,q] of s.offsets) bone.quaternion.copy(q);
  s.offsets.length=0;
  for(const [bone,pos] of s.positionOffsets)bone.position.copy(pos);
  s.positionOffsets.length=0;
  for(const [bone,pos,q] of s.recoveryBase){bone.position.copy(pos);bone.quaternion.copy(q);}
  s.recoveryBase.length=0;s.time+=dt;
  s.grabRing.visible=p.grabbedBy!=null;
  if(s.grabRing.visible){
    s.grabRing.scale.setScalar(1+.045*Math.sin(s.time*16));
    s.grabRing.material.color.setHex(p.escapeProgress>.6?0xffffff:0xffb765);
  }
  if(p.ragdoll?.active){
    s.hitSerial=p.hitSerial;s.punchSerial=p.punchSerial;
    s.grabWeight=0;s.strideWeight=0;s.secondaryMotion.reset();s.ragdollMotion=null;applyRagdollPose(p);
    if(p.mesh.userData.nameLabel)p.mesh.userData.nameLabel.position.y=1.3;
    return;
  }
  const speed = Math.hypot((p.vx||0)+(p.grabVelocityX||0),(p.vz||0)+(p.grabVelocityZ||0));
  const landed = !s.wasGrounded && !!p.ground;
  if (s.hitSerial !== p.hitSerial) {
    s.hitSerial = p.hitSerial;
    const c=Math.cos(p.facing), sn=Math.sin(p.facing);
    s.lean.v += (p.lastImpactX*c+p.lastImpactZ*sn)*5;
    s.roll.v += (-p.lastImpactX*sn+p.lastImpactZ*c)*5;
    s.ears.v += 5;
  }
  if (s.punchSerial !== p.punchSerial) {
    s.punchSerial=p.punchSerial;s.ears.v+=.8;
  }
  const restrained=p.grabbedBy!=null||p.grabFacingLocked;
  const movementRate=p.grabbedBy!=null?COMBAT.grabbedAnimationRate:p.grabFacingLocked?COMBAT.grabAnimationRate:1;
  if (!p.ground && !lobby) setAction(s,'Jump_Idle',movementRate);
  else setAction(s, speed > .4 && !lobby && !restrained ? 'Run' : 'Idle', Math.max(.8,speed/5.5)*movementRate);
  if (landed) { s.squash.v -= Math.min(.95,(p.landingSpeed||0)*.055); s.ears.v+=Math.min(4,(p.landingSpeed||0)*.3); }
  s.mixer.update(dt);
  const safeDt=Math.max(.008,dt), c=Math.cos(p.facing||0), sn=Math.sin(p.facing||0);
  const vx=(p.vx||0)+(p.impulseX||0)+(p.grabVelocityX||0), vz=(p.vz||0)+(p.impulseZ||0)+(p.grabVelocityZ||0);
  const ax=T.MathUtils.clamp((vx-s.lastVX)/safeDt,-30,30), az=T.MathUtils.clamp((vz-s.lastVZ)/safeDt,-30,30);
  const forward=ax*c+az*sn, side=-ax*sn+az*c;
  const lean=spring(s.lean,-forward*.006-speed*.012,65,9,dt);
  const roll=spring(s.roll,side*.006,55,8,dt);
  const squash=spring(s.squash,0,150,10,dt);
  const ears=spring(s.ears,forward*.01,48,4.5,dt);
  const dive=p.divePose||0;
  s.bodyPivot.rotation.z=lean*(1-dive)-dive*1.45;s.bodyPivot.rotation.x=roll*(1-dive);
  s.bodyPivot.position.y=.72-.36*(1-Math.cos(dive*1.45));
  s.bodyPivot.scale.set(1-squash*.4,1+squash,1-squash*.4);
  addBoneOffset(s,'Head',-lean*.3,roll*.25);
  for (const side of ['L','R']) {
    addBoneOffset(s,'Ear1'+side,ears*.4,roll*.2);
    addBoneOffset(s,'Ear2'+side,ears*.65,roll*.15);
    addBoneOffset(s,'LowerArm'+side,roll*.2,lean*.2);
  }
  directionalSteps(p,s,dt);
  secondaryMotion(p,s,dt,lobby);
  s.grabWeight=T.MathUtils.damp(s.grabWeight,(p.grabIntent||p.grabbing!=null)&&!p.getUpTime&&!p.diving&&!p.diveRecovery?1:0,16,dt);
  if(s.grabWeight>.001)reachArms(p,s,s.grabWeight);
  punchArms(p,s);
  if(dive>.001)reachArms(p,s,dive);
  if(s.recovery&&p.getUpTime>0){
    const blend=1-p.getUpTime/.55,t=blend*blend*(3-2*blend);
    for(const bone of s.bones.values()){
      const from=s.recovery.get(bone.name);if(!from)continue;
      s.recoveryBase.push([bone,bone.position.clone(),bone.quaternion.clone()]);
      bone.position.lerpVectors(from.p,bone.position,t);
      bone.quaternion.copy(from.q.clone().slerp(bone.quaternion,t));
    }
  }else s.recovery=null;
  if (p.mesh.userData.nameLabel) p.mesh.userData.nameLabel.position.y=p.downTime>0?1.05:2.4;
  for (const material of s.materials) {
    material.emissive.setHex(p.hitFlash>0?0xffcd7d:0x000000);
    material.emissiveIntensity=p.hitFlash>0?.5:0;
  }
  s.lastVX=vx;s.lastVZ=vz;s.wasGrounded=!!p.ground;
  if(lobby||p.getUpTime>0)s.ragdollMotion=null;else captureRagdollMotion(p,dt);
}
