import * as T from './three.module.js';

export const BOULDER={machineScale:1.65,radius:1.15,speed:20,lift:5.5,maxSpeed:26};
export const FACILITY_TYPES=['spinner','pendulum','boulder'];
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
  f.length=3.8;f.height=5;f.radius=.82;
  f.pivot=new T.Group();f.pivot.position.y=5;g.add(f.pivot);
  const rod=cylinder(f.pivot,.1,f.length,ink);rod.position.y=-f.length/2;
  f.bob=mesh(f.pivot,new T.IcosahedronGeometry(f.radius,1),coral);f.bob.position.y=-f.length;
  const band=mesh(f.bob,new T.TorusGeometry(.8,.07,6,24),cream);band.rotation.x=Math.PI/2;
  f.envelope=new T.Box3(V(-.9,0,-3.7),V(.9,5.25,3.7));
 }else if(type==='boulder'){
  f.interval=5.2;
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

function distanceSegments(p,q,a,b){
 const u=q.clone().sub(p),v=b.clone().sub(a),w=p.clone().sub(a);
 const aa=u.lengthSq(),bb=u.dot(v),cc=v.lengthSq(),dd=u.dot(w),ee=v.dot(w);
 let s=0,t=0;
 if(aa<1e-10)t=cc?T.MathUtils.clamp(ee/cc,0,1):0;
 else if(cc<1e-10)s=T.MathUtils.clamp(-dd/aa,0,1);
 else{const den=aa*cc-bb*bb;s=den?T.MathUtils.clamp((bb*ee-cc*dd)/den,0,1):0;t=(bb*s+ee)/cc;
  if(t<0){t=0;s=T.MathUtils.clamp(-dd/aa,0,1);}else if(t>1){t=1;s=T.MathUtils.clamp((bb-dd)/aa,0,1);}}
 return p.clone().addScaledVector(u,s).distanceTo(a.clone().addScaledVector(v,t));
}

export class PlaceableFacilities {
 constructor(api){Object.assign(this,api);this.facilities=[];this.rocks=[];this.clock=this.previousClock=this.nextRock=0;}
 add(surface){const f=surface.mesh.userData.facility;if(!f)return;f.surface=surface;f.lastCycle=0;this.facilities.push(f);this.poseOne(f,this.clock,true);}
 worldPoint(f,local){return local.applyMatrix4(f.surface.mesh.matrixWorld);}
 direction(f){return V(Math.cos(f.surface.angle),0,-Math.sin(f.surface.angle));}
 phase(f){return f.surface.offset;}
 pendulumPoint(f,time){const a=.85*Math.sin(time*.95+this.phase(f));return this.worldPoint(f,V(0,f.height-f.length*Math.cos(a),f.length*Math.sin(a)));}
 poseOne(f,time,physical){
  if(f.type==='spinner')f.pivot.rotation.y=time*f.speed+this.phase(f);
  if(f.type==='pendulum')f.pivot.rotation.x=-.85*Math.sin(time*.95+this.phase(f));
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
 hit(p,impact){
  if(!p.alive||p.finished||p.downTime>0||p.getUpTime>0||p.hazardCooldown>0)return;
  const a=V(p.x,p.y+.36,p.z),b=V(p.x,p.y+(p.diving?.8:1.1),p.z);
  for(const f of this.facilities){
   const s=f.surface;
   if(f.type==='spinner'&&Math.hypot(p.x-s.x,p.z-s.z)<f.radius+1){
    const n=Math.max(1,Math.ceil(Math.abs((this.clock-this.previousClock)*f.speed)*f.radius/.15));
    for(let i=0;i<=n;i++){
     const angle=T.MathUtils.lerp(this.previousClock,this.clock,i/n)*f.speed+this.phase(f)+s.angle;
     const dir=V(Math.cos(angle),0,-Math.sin(angle)),center=V(s.x,s.y+.82,s.z);
     if(distanceSegments(a,b,center.clone().addScaledVector(dir,-f.radius),center.clone().addScaledVector(dir,f.radius))<.66){impact(p,(p.z-s.z)*f.speed,-(p.x-s.x)*f.speed,8.5,5.2,'被旋轉棒掃倒');return;}
    }
   }else if(f.type==='pendulum'){
    const from=this.pendulumPoint(f,this.previousClock),to=this.pendulumPoint(f,this.clock);
    if(distanceSegments(a,b,from,to)<1.2){const velocity=to.clone().sub(from);if(velocity.lengthSq()<1e-8)velocity.copy(V(Math.sin(s.angle),0,Math.cos(s.angle))).multiplyScalar(Math.cos(this.clock*.95+this.phase(f)));impact(p,velocity.x,velocity.z,10,6,'被擺錘撞倒');return;}
   }
  }
  for(const r of this.rocks)if(distanceSegments(a,b,r.previous,r.mesh.position)<BOULDER.radius+.37){impact(p,r.velocity.x,r.velocity.z,10,5.7,'被滾石撞倒');return;}
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
   if(f.type==='spinner'&&Math.hypot(p.x-s.x,p.z-s.z)<f.radius+1.5&&Math.abs(p.y-s.y)<1){
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
