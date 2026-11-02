import * as T from './three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { clone } from './vendor/utils/SkeletonUtils.js';

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
  for (const clip of template.animations) actions.set(clip.name, mixer.clipAction(clip));
  const recover=template.animations.find(c=>c.name==='Death').clone();
  recover.name='GetUp';actions.set('GetUp',mixer.clipAction(recover));
  const state = {
    animal, bodyPivot, mixer, actions, bones, materials: [...materials.values()],
    action: '', punchSerial: 0, hitSerial: 0, lastVX: 0, lastVZ: 0, wasGrounded: true,
    lean: {x:0,v:0}, roll: {x:0,v:0}, squash: {x:0,v:0}, ears: {x:0,v:0},
    offsets: [], time: 0,
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
  for (const key of ['lean','roll','squash','ears']) Object.assign(s[key],{x:0,v:0});
  Object.assign(s,{punchSerial:0,hitSerial:0,lastVX:0,lastVZ:0,wasGrounded:true});
  s.bodyPivot.rotation.set(0,0,0); s.bodyPivot.scale.set(1,1,1);
  s.mixer.stopAllAction(); s.action=''; setAction(s,'Idle');
}

function addBoneOffset(s, name, x, z) {
  const bone = s.bones.get(name);
  if (!bone) return;
  if(!s.offsets.some(([other])=>other===bone))s.offsets.push([bone, bone.quaternion.clone()]);
  bone.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(x, 0, z)));
}

export function animateAnimal(p, dt, lobby = false) {
  const s = p.mesh.userData.animal;
  if (!s) return;
  // Undo the previous additive pose before evaluating the next animation frame.
  for (const [bone,q] of s.offsets) bone.quaternion.copy(q);
  s.offsets.length=0; s.time+=dt;
  const speed = Math.hypot(p.vx || 0, p.vz || 0);
  const landed = !s.wasGrounded && !!p.ground;
  if (p.downTime>0) {
    s.hitSerial=p.hitSerial;s.punchSerial=p.punchSerial;
    setAction(s,'Death',2.5);
  } else if (p.getUpTime>0) {
    setAction(s,'GetUp',-1.74);
  } else if (s.hitSerial !== p.hitSerial) {
    s.hitSerial = p.hitSerial;
    const c=Math.cos(p.facing), sn=Math.sin(p.facing);
    s.lean.v += (p.lastImpactX*c+p.lastImpactZ*sn)*5;
    s.roll.v += (-p.lastImpactX*sn+p.lastImpactZ*c)*5;
    s.ears.v += 5;
    setAction(s, 'HitReact', 2.1, true);
  } else if (s.punchSerial !== p.punchSerial) {
    s.punchSerial = p.punchSerial; setAction(s,'Punch',2.7,true);
  } else if (p.stagger > 0) setAction(s,'HitReact',2.1);
  else if (p.punchTime >= 0) setAction(s,'Punch',2.7);
  else if (!p.ground && !lobby) setAction(s,'Jump_Idle');
  else setAction(s, speed > .4 && !lobby ? 'Run' : 'Idle', Math.max(.8,speed/5.5));
  if (landed) { s.squash.v -= Math.min(.95,(p.landingSpeed||0)*.055); s.ears.v+=Math.min(4,(p.landingSpeed||0)*.3); }
  s.mixer.update(dt);
  const safeDt=Math.max(.008,dt), c=Math.cos(p.facing||0), sn=Math.sin(p.facing||0);
  const vx=(p.vx||0)+(p.impulseX||0), vz=(p.vz||0)+(p.impulseZ||0);
  const ax=T.MathUtils.clamp((vx-s.lastVX)/safeDt,-30,30), az=T.MathUtils.clamp((vz-s.lastVZ)/safeDt,-30,30);
  const forward=ax*c+az*sn, side=-ax*sn+az*c;
  const lean=spring(s.lean,-forward*.006-speed*.012,65,9,dt);
  const roll=spring(s.roll,side*.006,55,8,dt);
  const squash=spring(s.squash,0,150,10,dt);
  const ears=spring(s.ears,forward*.01,48,4.5,dt);
  s.bodyPivot.rotation.z=lean; s.bodyPivot.rotation.x=roll;
  s.bodyPivot.scale.set(1-squash*.4,1+squash,1-squash*.4);
  addBoneOffset(s,'Head',-lean*.3,roll*.25);
  for (const side of ['L','R']) {
    addBoneOffset(s,'Ear1'+side,ears*.4,roll*.2);
    addBoneOffset(s,'Ear2'+side,ears*.65,roll*.15);
    addBoneOffset(s,'LowerArm'+side,roll*.2,lean*.2);
    if (p.grabbing!==null && p.grabbing!==undefined) {
      addBoneOffset(s,'UpperArm'+side,-1.1,side==='L'?-.35:.35);
      addBoneOffset(s,'LowerArm'+side,-.45,0);
    }
  }
  if (p.mesh.userData.nameLabel) p.mesh.userData.nameLabel.position.y=p.downTime>0?1.05:2.4;
  for (const material of s.materials) {
    material.emissive.setHex(p.hitFlash>0?0xffcd7d:0x000000);
    material.emissiveIntensity=p.hitFlash>0?.5:0;
  }
  s.lastVX=vx;s.lastVZ=vz;s.wasGrounded=!!p.ground;
}
