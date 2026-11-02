import * as T from './three.module.js';
export const PENDULUM={amplitude:.85,rate:3};

export const BOULDER={machineScale:1.65,radius:1.15,speed:20/1.5,lift:5.5,maxSpeed:26};
export const FACILITY_TYPES=['spinner','pendulum','boulder','hammer'];
const IMPACT_SCALE={pendulum:1.35,hammer:1.35};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const ink=0x35565d,cream=0xf7e9bc,coral=0xec987c,blue=0x7faac5;
function mesh(g,geometry,color){const m=new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:.77}));m.castShadow=m.receiveShadow=true;g.add(m);return m;}
const box=(g,w,h,d,c)=>mesh(g,new T.BoxGeometry(w,h,d),c);
const cylinder=(g,r,h,c)=>mesh(g,new T.CylinderGeometry(r,r,h,16),c);

// Independent mechanisms with no supporting decks. Envelopes reserve moving
// parts even when their current pose occupies a smaller volume.
export function createFacilityModel(type){
 const g=new T.Group(),f={type};g.userData.facility=f;
 if(type==='spinner'){
  f.radius=4.2;f.speed=1.55;
  const post=cylinder(g,.32,1.35,ink);post.position.y=.675;
  f.pivot=new T.Group();f.pivot.position.y=.82;g.add(f.pivot);
  box(f.pivot,f.radius*2,.42,.42,coral);
  for(const x of [-3,-2,-1,1,2,3]){const stripe=box(f.pivot,.16,.43,.43,cream);stripe.position.x=x;}
  for(const sign of [-1,1]){const cap=mesh(f.pivot,new T.SphereGeometry(.3,12,8),cream);cap.position.x=sign*f.radius;}
  f.envelope=new T.Box3(V(-4.5,0,-4.5),V(4.5,1.35,4.5));
 }else if(type==='pendulum'){
  f.length=3.8;f.height=5;f.radius=1.35;f.headHalf=V(1.28,.54,.59);
  const axle=cylinder(g,.19,3.1,blue);axle.rotation.z=Math.PI/2;axle.position.y=f.height;axle.name='pendulum-axle';
  for(const sign of [-1,1]){const cap=cylinder(g,.3,.15,cream);cap.rotation.z=Math.PI/2;cap.position.set(sign*1.5,f.height,0);}
  const direction=mesh(g,new T.ConeGeometry(.22,.65,3),coral);direction.rotation.x=Math.PI/2;direction.position.set(0,5,.65);direction.name='swing-direction';
  f.pivot=new T.Group();f.pivot.position.y=5;g.add(f.pivot);
  const rod=cylinder(f.pivot,.1,f.length,ink);rod.position.y=-f.length/2;
  f.bob=box(f.pivot,2.4,1,1.1,coral);f.bob.position.y=-f.length;f.bob.name='pendulum-hammer-head';
  for(const sign of [-1,1]){const cap=box(f.bob,.16,1.08,1.18,cream);cap.position.x=sign*1.2;}
  f.envelope=new T.Box3(V(-1.6,0,-3.8),V(1.6,5.3,3.8));
 }else if(type==='hammer'){
  f.radius=2.1;f.speed=6.5;f.headOffset=1.55;f.headHalf=V(.45,.55,.75);
  const post=cylinder(g,.28,1.45,ink);post.position.y=.725;
  f.pivot=new T.Group();f.pivot.position.y=1.05;g.add(f.pivot);
  const handle=box(f.pivot,1.55,.2,.2,ink);handle.position.x=.775;
  f.bob=box(f.pivot,.8,1.05,1.4,coral);f.bob.position.x=f.headOffset;f.bob.name='rotating-hammer-head';
  for(const sign of [-1,1]){const cap=box(f.bob,.9,1.1,.12,cream);cap.position.z=sign*.69;}
  f.envelope=new T.Box3(V(-2.2,0,-2.2),V(2.2,1.65,2.2));
 }else if(type==='boulder'){
  f.interval=5.2/1.5;
  const body=box(g,2.2,1.7,2,blue);body.position.y=.85;
  const nozzle=cylinder(g,.84,1.4,ink);nozzle.rotation.z=Math.PI/2;nozzle.position.set(1.1,1.05,0);
  const rim=mesh(g,new T.TorusGeometry(.84,.1,8,24),cream);rim.rotation.y=Math.PI/2;rim.position.set(1.82,1.05,0);
  f.light=mesh(g,new T.SphereGeometry(.16,10,8),coral);f.light.position.set(0,2,0);
  const arrow=mesh(g,new T.ConeGeometry(.23,.55,3),cream);arrow.rotation.z=-Math.PI/2;arrow.position.set(.65,1.94,0);
  for(const child of g.children){child.position.multiplyScalar(BOULDER.machineScale);child.scale.multiplyScalar(BOULDER.machineScale);}
  f.envelope=new T.Box3(V(-1.1,0,-1.1).multiplyScalar(BOULDER.machineScale),V(1.94,2.2,1.1).multiplyScalar(BOULDER.machineScale));
 }else return null;
 return g;
}

function segmentContact(p,q,a,b){
 const u=q.clone().sub(p),v=b.clone().sub(a),w=p.clone().sub(a);
 const aa=u.lengthSq(),bb=u.dot(v),cc=v.lengthSq(),dd=u.dot(w),ee=v.dot(w);
 let s=0,t=0;
 if(aa<1e-10)t=cc?T.MathUtils.clamp(ee/cc,0,1):0;
 else if(cc<1e-10)s=T.MathUtils.clamp(-dd/aa,0,1);
 else{const den=aa*cc-bb*bb;s=den?T.MathUtils.clamp((bb*ee-cc*dd)/den,0,1):0;t=(bb*s+ee)/cc;
  if(t<0){t=0;s=T.MathUtils.clamp(-dd/aa,0,1);}else if(t>1){t=1;s=T.MathUtils.clamp((bb-dd)/aa,0,1);}}
 const body=p.clone().addScaledVector(u,s),object=a.clone().addScaledVector(v,t);return {body,object,distance:body.distanceTo(object)};
}

function distanceSegments(p,q,a,b){return segmentContact(p,q,a,b).distance;}
// Capsule segment against an oriented hammer head, including between frames.
function boxContact(a,b,center,rotation,half){
 const inverse=rotation.clone().invert(),start=a.clone().sub(center).applyQuaternion(inverse),end=b.clone().sub(center).applyQuaternion(inverse);
 const delta=end.clone().sub(start),point=t=>start.clone().addScaledVector(delta,t);
 const clampPoint=p=>p.clone().clamp(half.clone().negate(),half);
 const distance=t=>{const p=point(t);return p.distanceToSquared(clampPoint(p));};
 let lo=0,hi=1;for(let i=0;i<18;i++){const l=(2*lo+hi)/3,r=(lo+2*hi)/3;if(distance(l)<distance(r))hi=r;else lo=l;}
 const t=[0,1,(lo+hi)/2].sort((x,y)=>distance(x)-distance(y))[0],body=point(t),object=clampPoint(body);
 return {distance:body.distanceTo(object),body:body.applyQuaternion(rotation).add(center),object:object.applyQuaternion(rotation).add(center)};
}
export function contactImpulse(normal,objectVelocity,bodyVelocity){
 const relative=objectVelocity.clone().sub(bodyVelocity),closing=relative.dot(normal);
 if(closing<.2)return null;
 // Heavy driven mechanism, mildly elastic contact, limited tangential friction.
 const impulse=normal.clone().multiplyScalar(closing*1.12);
 const tangent=relative.addScaledVector(normal,-closing).clampLength(0,closing*.12);
 impulse.add(tangent).clampLength(0,18);impulse.impactEnergy=.5*closing*closing;
 impulse.contactNormal=normal.clone();impulse.objectVelocity=objectVelocity.clone();return impulse;
}

export class PlaceableFacilities {
 constructor(api){Object.assign(this,api);this.facilities=[];this.rocks=[];this.clock=this.previousClock=this.nextRock=0;}
 add(surface){const f=surface.mesh.userData.facility;if(!f)return;f.surface=surface;f.lastCycle=0;this.facilities.push(f);this.poseOne(f,this.clock,true);}
 worldPoint(f,local){return local.applyMatrix4(f.surface.mesh.matrixWorld);}
 direction(f){return V(Math.cos(f.surface.angle),0,-Math.sin(f.surface.angle));}
 phase(f){return f.surface.offset;}
 pendulumPoint(f,time){const a=PENDULUM.amplitude*Math.sin(time*PENDULUM.rate+this.phase(f));return this.worldPoint(f,V(0,f.height-f.length*Math.cos(a),f.length*Math.sin(a)));}
 poseOne(f,time,physical){
  if(f.type==='spinner'||f.type==='hammer')f.pivot.rotation.y=time*f.speed+this.phase(f);
  if(f.type==='pendulum')f.pivot.rotation.x=-PENDULUM.amplitude*Math.sin(time*PENDULUM.rate+this.phase(f));
  if(f.type==='boulder'){
   const charge=(time+this.phase(f))%f.interval>f.interval-.9;
   f.light.material.emissive.setHex(charge?0xff4b22:0);f.light.material.emissiveIntensity=2;f.light.scale.setScalar(BOULDER.machineScale*(charge?1.3:1));
  }
  f.surface.mesh.updateMatrixWorld(true);
  if(physical)this.updateSolidBounds(f.surface);
 }
 pose(time,physical=true){for(const f of this.facilities)this.poseOne(f,time,physical);}
 discard(m){m.parent?.remove(m);m.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 rockMesh(){const m=mesh(this.world,new T.IcosahedronGeometry(BOULDER.radius,1),0x8395a2);const band=mesh(m,new T.TorusGeometry(BOULDER.radius-.03,.05,5,20),cream);band.rotation.x=Math.PI/2;return m;}
 reset(){for(const r of this.rocks)this.discard(r.mesh);this.rocks=[];this.nextRock=0;this.clock=this.previousClock=0;for(const f of this.facilities)if(f.type==='boulder')f.lastCycle=Math.floor(this.phase(f)/f.interval);this.pose(0);}
 step(dt,time){
  this.previousClock=this.clock;this.clock=time;this.pose(time);
  for(const f of this.facilities)if(f.type==='boulder'){
   const cycle=Math.floor((time+this.phase(f))/f.interval);
   if(cycle>f.lastCycle){f.lastCycle=cycle;const m=this.rockMesh();m.position.copy(this.worldPoint(f,V(4.45,1.05*BOULDER.machineScale,0)));this.rocks.push({id:++this.nextRock,mesh:m,velocity:this.direction(f).multiplyScalar(BOULDER.speed).add(V(0,BOULDER.lift,0)),age:0,previous:m.position.clone()});}
  }
  for(const r of this.rocks){
   r.previous.copy(r.mesh.position);r.age+=dt;
   const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
   for(let i=0;i<steps;i++){
    r.velocity.y-=22*h;r.mesh.position.addScaledVector(r.velocity,h);
    for(const hit of this.collision.sphere(r.mesh.position,BOULDER.radius)){const inward=r.velocity.dot(hit.normal);if(inward<0)r.velocity.addScaledVector(hit.normal,-inward*(hit.normal.y>.5?1.02:1.45));}
    r.velocity.x*=Math.exp(-h*.08);r.velocity.z*=Math.exp(-h*.08);r.velocity.clampLength(0,BOULDER.maxSpeed);
    const axis=V(r.velocity.z,0,-r.velocity.x),speed=axis.length();if(speed>.001)r.mesh.rotateOnWorldAxis(axis.divideScalar(speed),speed*h/BOULDER.radius);
   }
  }
  this.rocks=this.rocks.filter(r=>{if(r.age<16&&r.mesh.position.y>-12&&Math.abs(r.mesh.position.z)<65&&r.mesh.position.x>-25&&r.mesh.position.x<245)return true;this.discard(r.mesh);return false;});
 }
 velocityAt(f,point,time){
  const s=f.surface;
  if(f.type==='spinner'||f.type==='hammer')return V(0,f.speed,0).cross(point.clone().sub(V(s.x,s.y+f.pivot.position.y,s.z)));
  if(f.type==='pendulum'){
   const angular=-PENDULUM.amplitude*PENDULUM.rate*Math.cos(time*PENDULUM.rate+this.phase(f));
   const axis=V(Math.cos(s.angle),0,-Math.sin(s.angle)).multiplyScalar(angular);
   return axis.cross(point.clone().sub(V(s.x,s.y+f.height,s.z)));
  }
  return V();
 }
 hit(p,impact,physical){
  if(!p.alive||p.finished||p.downTime>0||p.getUpTime>0||p.hazardCooldown>0)return;
  const a=V(p.x,p.y+.36,p.z),b=V(p.x,p.y+(p.diving?.8:1.1),p.z);
  let best=null;
  const consider=(f,point,normal,time,velocity)=>{
   const impulse=contactImpulse(normal,this.velocityAt(f,point,time),velocity);
   if(impulse){
    const scale=IMPACT_SCALE[f.type]??1;
    impulse.multiplyScalar(scale);impulse.impactEnergy*=scale*scale;
    if(!best||impulse.impactEnergy>best.impulse.impactEnergy)best={f,impulse,velocity};
   }
  };
  // Use actual triangle contact normals/points and the incoming (unprojected)
  // character velocity. Static spinner posts cannot produce rotating impulses.
  for(const contact of p.mechanismContacts||[]){
   const f=contact.surface.mesh.userData.facility;if(!['spinner','pendulum','hammer'].includes(f?.type))continue;
   let m=contact.mesh;while(m&&m!==f.pivot)m=m.parent;if(!m)continue;
   consider(f,contact.point,contact.normal,this.clock,contact.velocity);
  }
  const velocity=V(p.vx+(p.impulseX||0)+(p.grabVelocityX||0),p.vy||0,p.vz+(p.impulseZ||0)+(p.grabVelocityZ||0));
  // Sweep moving shapes between simulation frames so fast tips cannot tunnel.
  for(const f of this.facilities){
   if(!['spinner','pendulum','hammer'].includes(f.type))continue;
   const s=f.surface;if(Math.hypot(p.x-s.x,p.z-s.z)>(f.radius||0)+(f.length||0)+2)continue;
   const travel=f.type!=='pendulum'?Math.abs(f.speed)*f.radius:PENDULUM.amplitude*PENDULUM.rate*(f.length+f.radius);
   const n=Math.max(1,Math.ceil(Math.abs(this.clock-this.previousClock)*travel/.12));
   for(let i=0;i<=n;i++){
    const time=T.MathUtils.lerp(this.previousClock,this.clock,i/n);let contact,radius;
    if(f.type==='spinner'){
     const angle=time*f.speed+this.phase(f)+s.angle,dir=V(Math.cos(angle),0,-Math.sin(angle)),center=V(s.x,s.y+.82,s.z);
     contact=segmentContact(a,b,center.clone().addScaledVector(dir,-f.radius),center.clone().addScaledVector(dir,f.radius));radius=.66;
    }else{
     const yaw=new T.Quaternion().setFromAxisAngle(V(0,1,0),s.angle);
     let center,rotation;
     if(f.type==='pendulum'){
      center=this.pendulumPoint(f,time);rotation=yaw.multiply(new T.Quaternion().setFromAxisAngle(V(1,0,0),-PENDULUM.amplitude*Math.sin(time*PENDULUM.rate+this.phase(f))));
     }else{
      const angle=time*f.speed+this.phase(f)+s.angle;rotation=new T.Quaternion().setFromAxisAngle(V(0,1,0),angle);
      center=V(f.headOffset,0,0).applyQuaternion(rotation).add(V(s.x,s.y+1.05,s.z));
     }
     contact=boxContact(a,b,center,rotation,f.headHalf);radius=.36;
    }
    if(contact.distance>=radius)continue;
    const normal=contact.body.clone().sub(contact.object);
    // A deeply overlapping initial pose has no unique entry normal. Resolve
    // along closing motion instead of inventing an upward launch.
    if(contact.distance<radius*.25)normal.copy(this.velocityAt(f,contact.object,time)).sub(velocity);
    if(normal.lengthSq()<1e-8)continue;
    consider(f,contact.object,normal.normalize(),time,velocity);
   }
  }
  if(best){const {f,impulse,velocity}=best,why=f.type==='spinner'?'被旋轉棒掃中':f.type==='hammer'?'被旋轉槌子擊中':'被擺錘撞中';
   if(physical)physical(p,impulse,velocity,why);
   else impact(p,impulse.x,impulse.z,Math.hypot(impulse.x,impulse.z),impulse.y,why);
   return;
  }
  for(const r of this.rocks)if(distanceSegments(a,b,r.previous,r.mesh.position)<BOULDER.radius+.37){
   const contact=segmentContact(a,b,r.previous,r.mesh.position),normal=contact.body.clone().sub(contact.object);
   const entry=Math.sqrt(Math.max(0,(BOULDER.radius+.37)**2-contact.distance**2));
   normal.addScaledVector(r.velocity.clone().normalize(),entry);if(normal.lengthSq()<.01)normal.copy(r.velocity);
   const impulse=contactImpulse(normal.normalize(),r.velocity,velocity);
   if(impulse){if(physical)physical(p,impulse,velocity,'被滾石撞中');else impact(p,impulse.x,impulse.z,Math.hypot(impulse.x,impulse.z),impulse.y,'被滾石撞中');}return;
  }
 }
 avoid(p,input,time){
  if(!p.ground||p.grabbedBy!=null)return input;
  const safe=(x,z)=>this.surfaces().some(s=>{const q=this.supportAt(s,x,z);return q&&q.normal.y>.6&&Math.abs(q.height-p.y)<.8;});
  for(const r of this.rocks){const dx=p.x-r.mesh.position.x,dz=p.z-r.mesh.position.z,speed=Math.hypot(r.velocity.x,r.velocity.z)||1;
   const along=(dx*r.velocity.x+dz*r.velocity.z)/speed,side=(dx*-r.velocity.z+dz*r.velocity.x)/speed;
   if(along>-1&&along<14&&Math.abs(side)<BOULDER.radius+.9&&Math.abs(r.mesh.position.y-p.y)<3.5){
    for(const sign of [side>=0?1:-1,side>=0?-1:1]){const x=-r.velocity.z/speed*sign,z=r.velocity.x/speed*sign;if(safe(p.x+x,p.z+z))return {x,z,jump:false};}
   }
  }
  for(const f of this.facilities){const s=f.surface;
   if((f.type==='spinner'||f.type==='hammer')&&Math.hypot(p.x-s.x,p.z-s.z)<f.radius+1.5&&Math.abs(p.y-s.y)<1){
    const angle=(time+.22)*f.speed+this.phase(f)+s.angle,center=V(s.x,s.y+.82,s.z),dir=V(Math.cos(angle),0,-Math.sin(angle));
    const here=V(p.x+input.x*.9,s.y+.82,p.z+input.z*.9);
    if(distanceSegments(here,here,center.clone().addScaledVector(dir,-f.radius),center.clone().addScaledVector(dir,f.radius))<.95)return {...input,jump:true};
   }
   if(f.type==='pendulum'){const bob=this.pendulumPoint(f,time+.3);if(Math.hypot(p.x+input.x*.8-bob.x,p.z+input.z*.8-bob.z)<1.5&&bob.y-p.y<2.3&&bob.y>p.y)return {x:0,z:0,jump:false};}
  }
  return input;
 }
 snapshot(){return this.rocks.map(r=>({id:r.id,x:r.mesh.position.x,y:r.mesh.position.y,z:r.mesh.position.z,q:r.mesh.quaternion.toArray()}));}
 receive(rocks,time){
  const ids=new Set(rocks.map(r=>r.id));this.rocks=this.rocks.filter(r=>{if(ids.has(r.id))return true;this.discard(r.mesh);return false;});
  for(const data of rocks){let r=this.rocks.find(r=>r.id===data.id);if(!r){r={id:data.id,mesh:this.rockMesh()};this.rocks.push(r);}r.mesh.position.set(data.x,data.y,data.z);r.mesh.quaternion.fromArray(data.q);}
  this.clock=time;this.pose(time,false);
 }
}
