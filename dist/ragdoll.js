import {ICE} from './ice.js';
import * as T from './three.module.js';

const V = () => new T.Vector3();
const Q = () => new T.Quaternion();
const radii={Body:.23,Hips:.22,Abdomen:.25,Torso:.28,Neck:.24,Head:.27};
const excluded=/^(Root|PoleTarget)/;
const coreNames=new Set(['Body','Hips','Abdomen','Torso','Neck','Head',
  'ShoulderL','ShoulderR','UpperArmL','UpperArmR','UpperLegL','UpperLegR','Ear1L','Ear1R']);
const jointLimits={UpperArm:1.5,LowerArm:1.65,UpperLeg:.8,LowerLeg:1.05,Ear1:.45,Ear2:.55};
function jointLimit(name){
  return Object.entries(jointLimits).find(([prefix])=>name.startsWith(prefix))?.[1]??0;
}
function coreFrame(nodes){
  const side=nodes.get('UpperArmL').p.clone().sub(nodes.get('UpperArmR').p).normalize();
  const up=nodes.get('Neck').p.clone().sub(nodes.get('Body').p);
  up.addScaledVector(side,-up.dot(side)).normalize();
  if(side.lengthSq()<.5||up.lengthSq()<.5)return null;
  return Q().setFromRotationMatrix(new T.Matrix4().makeBasis(side,up,V().crossVectors(side,up).normalize()));
}
function fitCore(r){
  const core=r.core,frame=coreFrame(r.nodes);
  if(frame)core.rotation.copy(frame).multiply(core.restFrame.clone().invert()).normalize();
  core.center.set(0,0,0);
  for(const n of core.nodes)core.center.add(n.p);
  core.center.multiplyScalar(1/core.nodes.length);
  // A single rigid transform for the entire chest/pelvis/head prevents
  // independent spine particles from flattening or shearing the skin.
  for(const n of core.nodes)n.p.copy(core.offsets.get(n.name)).applyQuaternion(core.rotation).add(core.center);
}

// Track pose motion in world axes relative to the actor origin. Translation is
// already supplied by gameplay velocity, so it must not be differentiated twice.
export function captureRagdollMotion(p,dt){
  const rig=p.mesh.userData.animal;if(!rig)return;
  if(dt<=0||dt>.1){rig.ragdollMotion=null;return;}
  p.mesh.updateMatrixWorld(true);
  const origin=p.mesh.getWorldPosition(V()),rotation=p.mesh.getWorldQuaternion(Q());
  let sample=rig.ragdollMotion;
  if(sample&&(origin.distanceTo(sample.origin)>2||rotation.angleTo(sample.rotation)>1.1))sample=null;
  const ready=!!sample,blend=1-Math.exp(-40*dt),point=V(),velocity=V();
  sample??={origin:V(),rotation:Q(),points:new Map(),velocities:new Map(),ready:false};
  for(const [name,bone] of rig.bones){
    if(excluded.test(name))continue;
    point.setFromMatrixPosition(bone.matrixWorld).sub(origin);
    const previous=sample.points.get(name);
    if(previous){
      velocity.copy(point).sub(previous).divideScalar(dt).clampLength(0,16);
      sample.velocities.get(name).lerp(velocity,blend);previous.copy(point);
    }else{sample.points.set(name,point.clone());sample.velocities.set(name,V());}
  }
  sample.origin.copy(origin);sample.rotation.copy(rotation);sample.ready=ready;
  rig.ragdollMotion=sample;
}

function inheritPoseMotion(p,rig,nodes,coreNodes,center){
  const sample=rig.ragdollMotion;
  rig.ragdollMotion=null;
  if(!sample?.ready||p.mesh.getWorldPosition(V()).distanceTo(sample.origin)>2||p.mesh.getWorldQuaternion(Q()).angleTo(sample.rotation)>1.1)return;
  const mean=coreNodes.reduce((sum,n)=>sum.add(sample.velocities.get(n.name)??V()),V()).divideScalar(coreNodes.length);
  // Fit a single angular velocity to the core, keeping chest/head dimensions rigid.
  let xx=0,yy=0,zz=0,xy=0,xz=0,yz=0;const torque=V();
  for(const n of coreNodes){
    const r=n.p.clone().sub(center),v=(sample.velocities.get(n.name)??V()).clone().sub(mean);
    xx+=r.y*r.y+r.z*r.z;yy+=r.x*r.x+r.z*r.z;zz+=r.x*r.x+r.y*r.y;
    xy-=r.x*r.y;xz-=r.x*r.z;yz-=r.y*r.z;torque.add(r.clone().cross(v));
  }
  const inertia=new T.Matrix3().set(xx,xy,xz,xy,yy,yz,xz,yz,zz);
  const angular=Math.abs(inertia.determinant())>1e-9?torque.applyMatrix3(inertia.invert()):V();
  const bounded=angular.clone().clampLength(0,8);
  for(const n of nodes.values()){
    const offset=n.p.clone().sub(center),spin=bounded.clone().cross(offset);
    if(!coreNames.has(n.name)){
      // Retain arm/leg/ear articulation separately from whole-body rotation.
      const relative=(sample.velocities.get(n.name)??V()).clone().sub(mean).sub(angular.clone().cross(offset)).clampLength(0,5);
      spin.add(relative);
    }
    n.velocity.add(spin);
  }
}

// Articulated position-based dynamics: independent masses, gravity, joint
// lengths, bend limits, surface friction and a physical hand constraint.
// No death clip, fixed fall pose or root-following animation is used.
export function beginRagdoll(p) {
  const s=p.mesh.userData.animal;
  if(!s || p.ragdoll?.active)return;
  // Capture the current world orientation, including a dive, before resetting
  // the visual pivot in applyRagdollPose. The skeleton root preserves this pose.
  s.bodyPivot.scale.set(1,1,1);
  p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=-p.facing;
  p.mesh.updateMatrixWorld(true);
  const nodes=new Map(),links=[],binds=[];
  const launchVelocity=V().set((p.vx||0)+(p.impulseX||0)+(p.grabVelocityX||0),p.vy||0,(p.vz||0)+(p.impulseZ||0)+(p.grabVelocityZ||0));
  for(const [name,bone] of s.bones){
    const position=bone.getWorldPosition(V());
    binds.push({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone(),
      worldQ:bone.getWorldQuaternion(Q()),world:position.clone()});
    if(excluded.test(name))continue;
    const radius=radii[name]??(name.startsWith('Ear')?.065:name.startsWith('Foot')?.12:.105);
    const mass=radii[name]?2.5:name.startsWith('Ear')?.18:.65;
    const velocity=launchVelocity.clone();
    const node={name,bone,p:position,prev:position.clone(),velocity,radius,invMass:1/mass};
    nodes.set(name,node);
  }
  function link(an,bn,minRatio=1,maxRatio=1){
    const a=nodes.get(an),b=nodes.get(bn);if(!a||!b)return;
    const length=a.p.distanceTo(b.p);
    if(length>.001)links.push({a,b,min:length*minRatio,max:length*maxRatio});
  }
  for(const node of nodes.values())if(nodes.has(node.bone.parent?.name))link(node.name,node.bone.parent.name);
  for(const side of ['L','R']){
    link('LowerLeg'+side,'Foot'+side);
    link('UpperArm'+side,'Fist'+side,.35,1.02); // elbow range
    link('UpperLeg'+side,'Foot'+side,.45,1.02); // knee range
    link('Body','UpperArm'+side,.85,1.03);
    link('Torso','Ear1'+side,.85,1.05);
  }
  link('UpperArmL','UpperArmR');link('UpperLegL','UpperLegR');
  link('Body','Torso',.88,1.02);link('Hips','Neck',.8,1.03);
  link('Torso','Head',.9,1.03);link('Ear1L','Ear1R');
  // Bind directions are captured from the current animated pose so entry is continuous.
  for(const bind of binds){
    const node=nodes.get(bind.bone.name);
    if(!node)continue;
    let child=bind.bone.children.find(b=>nodes.has(b.name));
    if(bind.bone.name.startsWith('LowerLeg'))child=nodes.get('Foot'+bind.bone.name.at(-1))?.bone;
    bind.child=child?.name;
    if(child)bind.direction=nodes.get(child.name).p.clone().sub(node.p).normalize();
  }
  const coreNodes=[...nodes.values()].filter(n=>coreNames.has(n.name));
  const center=coreNodes.reduce((sum,n)=>sum.add(n.p),V()).multiplyScalar(1/coreNodes.length);
  inheritPoseMotion(p,s,nodes,coreNodes,center);
  // Opposing upper/lower-body offsets give the impact a tumble without adding
  // hidden linear momentum to the rigid core. A plain fall has no artificial kick.
  const spin=p.impactSpin??0;
  for(const node of nodes.values()){
    const offset=(node.p.y-center.y)*spin;
    node.velocity.x+=(p.lastImpactX||0)*offset;node.velocity.z+=(p.lastImpactZ||0)*offset;
  }
  const core={nodes:coreNodes,restCenter:center.clone(),center:center.clone(),restFrame:coreFrame(nodes),
    rotation:Q(),offsets:new Map(coreNodes.map(n=>[n.name,n.p.clone().sub(center)]))};
  p.ragdoll={active:true,nodes,links,binds,bindMap:new Map(binds.map(b=>[b.bone.name,b])),core,
    grip:null,accumulator:0,ground:null,support:null,contacts:0,launching:(p.vy||0)>.5};
  p.vx=launchVelocity.x;p.vy=launchVelocity.y;p.vz=launchVelocity.z;
  p.impulseX=0;p.impulseZ=0;p.grabVelocityX=0;p.grabVelocityZ=0;
}

function solveLink(c){
  const delta=V().subVectors(c.b.p,c.a.p),distance=delta.length();
  if(distance<1e-8)return;
  const target=T.MathUtils.clamp(distance,c.min,c.max);
  if(Math.abs(distance-target)<1e-7)return;
  const factor=(distance-target)/(distance*(c.a.invMass+c.b.invMass));
  c.a.p.addScaledVector(delta,factor*c.a.invMass);
  c.b.p.addScaledVector(delta,-factor*c.b.invMass);
}

export function stepRagdoll(p,dt,world,players=[]){
  if(!p.ragdoll?.active)beginRagdoll(p);
  const r=p.ragdoll;if(!r)return;
  const nodes=[...r.nodes.values()];
  // Impacts and fan forces are impulses, transferred once to the articulated body.
  for(const n of nodes){n.velocity.x+=p.impulseX||0;n.velocity.z+=p.impulseZ||0;}
  p.impulseX=0;p.impulseZ=0;
  r.accumulator+=Math.min(dt,.05);
  const h=1/120;
  while(r.accumulator>=h){
    const angularDrag=(r.settleInPlace||(r.ground&&!r.launching))?.8:.22;
    r.accumulator-=h;r.ground=null;r.support=null;r.contacts=0;
    const bulk=r.core.nodes.reduce((sum,n)=>sum.add(n.velocity),V()).divideScalar(r.core.nodes.length);
    const drift=bulk.clone();drift.y-=22*h;drift.multiplyScalar(Math.exp(-.8*h));
    for(const n of nodes){
      n.prev.copy(n.p);
      // Keep the existing flight drag, but let angular/limb inertia decay slowly.
      // No animation target or periodic force drives the body while it is limp.
      n.velocity.sub(bulk).multiplyScalar(Math.exp(-angularDrag*h)).add(drift);
      if(r.grip?.node===n.name){
        const force=r.grip.target.clone().sub(n.p).multiplyScalar(115).addScaledVector(n.velocity,-9);
        force.clampLength(0,100);n.velocity.addScaledVector(force,h);
      }
      n.velocity.clampLength(0,24);n.p.addScaledVector(n.velocity,h);
    }
    const contacts=new Map();
    for(let iteration=0;iteration<12;iteration++){
      if(r.grip){
        const hand=r.nodes.get(r.grip.node);
        hand.p.add(r.grip.target.clone().sub(hand.p).multiplyScalar(.28).clampLength(0,.05));
      }
      for(const c of r.links)solveLink(c);
      fitCore(r);
      // Keep non-neighbouring extremities from passing through the torso.
      const torso=r.nodes.get('Torso');
      for(const n of nodes)if(/^(Fist|Foot)/.test(n.name)){
        const d=n.p.clone().sub(torso.p),minimum=torso.radius+n.radius*.65;
        if(d.length()<minimum&&d.lengthSq()>1e-8)n.p.addScaledVector(d,(minimum/d.length()-1)*.5);
      }
      if(iteration%2===1){
        for(const n of nodes){
          const hits=world.sphere(n.p,n.radius);
          if(hits.length)contacts.set(n,hits);
          for(const other of players){
            if(other===p||!other.alive||other.finished||Math.hypot(other.x-p.x,other.z-p.z)>3)continue;
            // A standing player's capsule is solid to the loose limbs.
            const centers=other.ragdoll?.active?[other.ragdoll.nodes.get('Torso').p]:
              [V().set(other.x,T.MathUtils.clamp(n.p.y,other.y+.36,other.y+1.09),other.z)];
            for(const center of centers){
              const delta=n.p.clone().sub(center),distance=delta.length(),radius=n.radius+.3;
              if(distance>1e-6&&distance<radius){
                n.p.addScaledVector(delta,(radius-distance)/distance*.7);
                other.impulseX-=delta.x*h*.3;other.impulseZ-=delta.z*h*.3;
              }
            }
          }
        }
      }
    }
    fitCore(r);
    // Final contact correction translates the whole rigid core together.
    // It must not move individual chest/head bones after shape preservation.
    for(let pass=0;pass<2;pass++)for(const n of r.core.nodes){
      const corrected=n.p.clone(),hits=world.sphere(corrected,n.radius);
      if(!hits.length)continue;
      const shift=corrected.sub(n.p);
      for(const coreNode of r.core.nodes)coreNode.p.add(shift);
      r.core.center.add(shift);contacts.set(n,hits);
    }
    for(const n of nodes){
      n.velocity.copy(n.p).sub(n.prev).multiplyScalar(1/h);
      const hits=contacts.get(n);
      if(!hits)continue;
      for(const hit of hits){
        const vn=n.velocity.dot(hit.normal);
        if(vn<0)n.velocity.addScaledVector(hit.normal,-vn);
      }
      // Stationary wave collapses settle without a long skid; moving victims use
      // normal friction. Grabbing and frozen surfaces retain their usual drag.
      const drag=hits.every(hit=>hit.surface?.frozen)?ICE.contactDrag:r.settleInPlace&&!r.grip?35:7;
      n.velocity.multiplyScalar(Math.exp(-drag*h));r.contacts++;
    }
    // Every physical body part can carry the ragdoll, including a head/ear
    // resting on a ledge. Query the solved pose instead of an earlier impact.
    for(const n of nodes){
      const support=world.sphereSupport(n.p,n.radius);
      if(support){r.support=support;r.ground=support.surface;break;}
    }
    const average=r.core.nodes.reduce((sum,n)=>sum.add(n.velocity),V()).multiplyScalar(1/r.core.nodes.length);
    if(r.launching){
      // Feet can still overlap the floor during the first launch substep.
      // That contact must neither cancel the upward impulse nor count as landing.
      r.ground=null;r.support=null;
      if(average.y<=0)r.launching=false;
    }
    if(r.ground){
      // A contact projection is not a spring. Damp residual rotation and
      // discard upward COM velocity introduced by rigid-shape corrections.
      const corrected=average.clone();corrected.y=Math.min(0,corrected.y);
      for(const n of r.core.nodes)n.velocity.sub(average).multiplyScalar(Math.exp(-5*h)).add(corrected);
    }
  }
  const pelvis=r.nodes.get('Body');
  p.x=pelvis.p.x;p.z=pelvis.p.z;p.y=pelvis.p.y-.25;
  p.vx=pelvis.velocity.x;p.vz=pelvis.velocity.z;p.vy=pelvis.velocity.y;
  p.ground=r.ground;
}

export function applyRagdollPose(p){
  const s=p.mesh.userData.animal,r=p.ragdoll;if(!s||!r)return;
  s.bodyPivot.rotation.set(0,0,0);s.bodyPivot.scale.set(1,1,1);s.bodyPivot.position.y=.72;
  p.mesh.updateMatrixWorld(true);
  // Restore all local offsets and scales first. Only the skeleton root may
  // translate; joint rotations can never change the length of a skinned bone.
  for(const bind of r.binds){
    bind.bone.position.copy(bind.position);bind.bone.quaternion.copy(bind.quaternion);bind.bone.scale.copy(bind.scale);
  }
  const rootBind=r.bindMap.get('Root'),root=rootBind.bone,core=r.core;
  const rootPosition=rootBind.world.clone().sub(core.restCenter).applyQuaternion(core.rotation).add(core.center);
  root.position.copy(root.parent.worldToLocal(rootPosition));
  root.quaternion.copy(root.parent.getWorldQuaternion(Q()).invert().multiply(core.rotation.clone().multiply(rootBind.worldQ)));
  root.updateMatrixWorld(true);
  // Swing-only joint offsets avoid arbitrary twisting. Each child stays at its
  // original local translation even when a physics constraint is under load.
  for(const bind of r.binds){
    const bone=bind.bone,limit=jointLimit(bone.name);
    if(!limit||!bind.child)continue;
    const start=bone.getWorldPosition(V());
    const current=bone.getWorldQuaternion(Q());
    const from=bind.direction.clone().applyQuaternion(current.clone().multiply(bind.worldQ.clone().invert())).normalize();
    const to=r.nodes.get(bind.child).p.clone().sub(start).normalize();
    if(from.lengthSq()<.5||to.lengthSq()<.5)continue;
    const desired=Q().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(Q()));
    desired.premultiply(bone.parent.getWorldQuaternion(Q()).invert());
    const angle=bind.quaternion.angleTo(desired);
    bone.quaternion.copy(bind.quaternion).slerp(desired,angle>limit?limit/angle:1).normalize();
    bone.updateMatrixWorld(true);
  }
  // This asset's foot controls are siblings of Body, rather than children of
  // the shins. Place each foot from its shin's fixed bind offset, never from a
  // free particle; this keeps the ankle attached without stretching the leg.
  for(const side of ['L','R']){
    const foot=r.bindMap.get('Foot'+side),shin=r.bindMap.get('LowerLeg'+side);
    const delta=shin.bone.getWorldQuaternion(Q()).multiply(shin.worldQ.clone().invert());
    const end=foot.world.clone().sub(shin.world).applyQuaternion(delta).add(shin.bone.getWorldPosition(V()));
    foot.bone.position.copy(foot.bone.parent.worldToLocal(end));
    foot.bone.quaternion.copy(foot.bone.parent.getWorldQuaternion(Q()).invert().multiply(delta).multiply(foot.worldQ));
    foot.bone.updateMatrixWorld(true);
  }
}

export function beginRecovery(p){
  const r=p.ragdoll;if(!r?.active)return;
  r.active=false;r.grip=null;
  const s=p.mesh.userData.animal;
  applyRagdollPose(p);
  s.recovery=new Map([...s.bones.values()].map(b=>[b.name,{p:b.position.clone(),q:b.quaternion.clone()}]));
  // Restore the animation's inputs before blending toward the standing pose.
  for(const b of r.binds){b.bone.position.copy(b.position);b.bone.quaternion.copy(b.quaternion);b.bone.scale.copy(b.scale);}
  p.vx=0;p.vz=0;p.vy=0;
}

export function resetRagdoll(p){
  if(p.mesh?.userData.animal)p.mesh.userData.animal.ragdollMotion=null;
  if(p.ragdoll){
    for(const b of p.ragdoll.binds){b.bone.position.copy(b.position);b.bone.quaternion.copy(b.quaternion);b.bone.scale.copy(b.scale);}
  }
  p.ragdoll=null;
  if(p.mesh?.userData.animal)p.mesh.userData.animal.recovery=null;
}
