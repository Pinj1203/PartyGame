import * as T from './three.module.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const overlap=(a,b)=>a.minX<b.maxX-.02&&a.maxX>b.minX+.02&&a.minY<b.maxY-.02&&a.maxY>b.minY+.02&&a.minZ<b.maxZ-.02&&a.maxZ>b.minZ+.02;
const bounds=b=>({minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z});
const palette={mint:0x82cbbb,coral:0xec987c,cream:0xf7e9bc,blue:0x7faac5,purple:0xb5a2d7,ink:0x35565d,stone:0x8395a2};

// Closest distance between finite segments: moving arms are capsules, not
// infinitely wide trigger planes. The same test handles the player's capsule.
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

export class ObstacleCourse {
 constructor(api){Object.assign(this,api);this.facilities=[];this.rocks=[];this.reservations=[];this.dynamicAnchors=new Set();this.clock=0;this.previousClock=0;this.nextRock=0;this.built=false;}
 mesh(geometry,color,parent=this.world){const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:.77}));mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 box(w,h,d,color,parent){return this.mesh(new T.BoxGeometry(w,h,d),color,parent);}
 cylinder(r,h,color,parent,segments=16){return this.mesh(new T.CylinderGeometry(r,r,h,segments),color,parent);}
 discard(mesh){mesh.parent?.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
 attach(s,mesh,moving=false){mesh.updateMatrixWorld(true);s.mesh.userData.solids.push(mesh);if(moving)this.dynamicAnchors.add(s);this.updateSolidBounds(s);}
 reserve(x,y,z,w,h,d){this.reservations.push({minX:x-w/2,maxX:x+w/2,minY:y,maxY:y+h,minZ:z-d/2,maxZ:z+d/2});}
 blocked(box){return this.reservations.some(b=>overlap(box,b));}
 deck(x,z,y,w,d,color=palette.mint,shape='box'){
  const s=this.addSurface('platform',x,z,y,0,w,d,true);s.courseFloor=y;s.courseZone=true;s.courseShape=shape;
  for(const child of [...s.mesh.children])this.discard(child);s.mesh.userData.solids=[];
  const floor=shape==='disc'?this.cylinder(w/2,.6,color,s.mesh,32):this.box(w,.6,d,color,s.mesh);
  floor.position.y=-.3;floor.name='platform-deck';s.mesh.userData.solids.push(floor);
  if(shape==='disc'){s.w=s.d=w*.7;}
  else for(const side of [-1,1]){const strip=this.box(w,.035,.18,palette.cream,s.mesh);strip.position.set(0,.018,side*(d/2-.12));}
  const support=this.box(Math.min(w*.72,12),2.6,Math.min(d*.72,12),palette.ink,s.mesh);support.position.y=-1.9;s.mesh.userData.solids.push(support);
  this.updateSolidBounds(s);s.placementBounds=bounds(s.worldBounds);return s;
 }
 ramp(x0,x1,z,y0,y1,width,color=palette.mint){
  const n=Math.max(1,Math.ceil(Math.abs(y1-y0)/1.05),Math.ceil(Math.abs(x1-x0)/6));
  const out=[];
  for(let i=0;i<n;i++){
   const xa=T.MathUtils.lerp(x0,x1,i/n),xb=T.MathUtils.lerp(x0,x1,(i+1)/n),ya=T.MathUtils.lerp(y0,y1,i/n),yb=T.MathUtils.lerp(y0,y1,(i+1)/n);
   const s=this.deck((xa+xb)/2,z,(ya+yb)/2,xb-xa,width,color);s.courseRamp=true;
   for(const child of [...s.mesh.children])if(child.name!=='platform-deck')this.discard(child);
   const floor=s.mesh.children[0],position=floor.geometry.attributes.position;
   for(let j=0;j<position.count;j++)position.setY(j,position.getY(j)+position.getX(j)*(yb-ya)/(xb-xa));
   position.needsUpdate=true;floor.geometry.computeVertexNormals();floor.geometry.computeBoundingBox();
   s.mesh.userData.solids=[floor];s.placementBounds=null;
   this.updateSolidBounds(s);s.placementBounds=bounds(s.worldBounds);out.push(s);
   for(const side of [-1,1]){const stripe=this.box(xb-xa,.035,.15,palette.cream,s.mesh);stripe.rotation.z=Math.atan2(yb-ya,xb-xa);stripe.position.set(0,.03,side*(width/2-.12));}
  }
  return out;
 }
 bridgeZ(x,z0,z1,y,width,color=palette.blue){
  return this.deck(x,(z0+z1)/2,y,width,Math.abs(z1-z0),color);
 }
 rail(s,x,z,w,d,height=1){const bar=this.box(w,height,d,palette.ink);bar.position.set(x,s.courseFloor+height/2,z);this.attach(s,bar);this.reserve(x,s.courseFloor,z,w,height,d);return bar;}
 sign(text,x,y,z,color='#35565d'){const tag=this.label(text,color);tag.position.set(x,y,z);tag.scale.set(10,2.5,1);this.world.add(tag);return tag;}
 arch(s,x,z,width,color,text){
  for(const side of [-1,1]){const post=this.box(.5,6,.5,palette.ink);post.position.set(x,s.courseFloor+3,z+side*width/2);this.attach(s,post);this.reserve(x,s.courseFloor,z+side*width/2,.5,6,.5);}
  const beam=this.box(.7,.8,width+.8,color);beam.position.set(x,s.courseFloor+6,z);this.attach(s,beam);this.reserve(x,s.courseFloor+5.6,z,.7,.8,width+.8);
  this.sign(text,x,s.courseFloor+7.5,z);
 }
 spinner(s,x,z,radius=5.8,speed=.9,phase=0){
  s.courseHazard=true;
  const y=s.courseFloor,base=this.cylinder(.55,1.35,palette.ink);base.position.set(x,y+.675,z);this.attach(s,base);this.reserve(x,y,z,1.1,1.35,1.1);
  const pivot=new T.Group();pivot.position.set(x,y+.82,z);this.world.add(pivot);
  const arm=this.box(radius*2,.48,.48,palette.coral,pivot);this.attach(s,arm,true);
  for(let i=-Math.floor(radius);i<=radius;i++){const stripe=this.box(.18,.495,.495,i%2?palette.cream:palette.coral,pivot);stripe.position.x=i;}
  for(const side of [-1,1]){const cap=this.mesh(new T.SphereGeometry(.38,12,8),palette.cream,pivot);cap.position.x=side*radius;}
  const ring=this.mesh(new T.TorusGeometry(radius+.5,.05,6,64),palette.cream);ring.rotation.x=-Math.PI/2;ring.position.set(x,y+.04,z);
  const f={type:'spinner',x,y,z,radius,speed,phase,pivot,anchor:s};this.facilities.push(f);
  this.reserve(x,y+.35,z,radius*2+1.2,1.1,radius*2+1.2);return f;
 }
 pendulum(s,x,z,phase=0){
  s.courseHazard=true;
  const y=s.courseFloor,length=6.6,height=8.0;
  for(const side of [-1,1]){const post=this.box(.6,height,.6,palette.ink);post.position.set(x,y+height/2,z+side*8.6);this.attach(s,post);this.reserve(x,y,z+side*8.6,.6,height,.6);}
  const beam=this.box(.8,.7,18,palette.blue);beam.position.set(x,y+height,z);this.attach(s,beam);this.reserve(x,y+height-.35,z,.8,.7,18);
  const pivot=new T.Group();pivot.position.set(x,y+height,z);this.world.add(pivot);
  const rod=this.cylinder(.13,length,palette.ink,pivot,10);rod.position.y=-length/2;
  const bob=this.mesh(new T.IcosahedronGeometry(1.18,1),palette.coral,pivot);bob.position.y=-length;this.attach(s,bob,true);this.attach(s,rod,true);
  const band=this.mesh(new T.TorusGeometry(1.15,.09,6,24),palette.cream,bob);band.rotation.x=Math.PI/2;
  const f={type:'pendulum',x,y,z,length,height,phase,pivot,bob,anchor:s};this.facilities.push(f);
  this.reserve(x,y+.15,z,2.65,height,13.5);return f;
 }
 launcher(s,x,z,phase=0){
  const y=s.courseFloor;
  const housing=this.box(3.3,2.3,3,palette.blue);housing.position.set(x,y+1.15,z);this.attach(s,housing);this.reserve(x,y,z,3.3,3,3);
  const mouth=this.cylinder(1.22,2,palette.ink);mouth.rotation.z=Math.PI/2;mouth.position.set(x-1.1,y+1.3,z);this.attach(s,mouth);
  const rim=this.mesh(new T.TorusGeometry(1.22,.14,8,24),palette.cream);rim.rotation.y=Math.PI/2;rim.position.set(x-2.15,y+1.3,z);
  const light=this.mesh(new T.SphereGeometry(.25,10,8),palette.coral);light.position.set(x-.5,y+2.8,z);
  const f={type:'launcher',x,y,z,phase,interval:5.2,lastCycle:-1,light};this.facilities.push(f);return f;
 }
 build(){
  // Preserve start / midpoint / finish IDs used by scoring and network snapshots.
  const start=this.deck(0,0,0,14,18,palette.mint);
  const mid=this.deck(108,0,12,10,20,palette.blue);
  const finish=this.deck(216,0,24,18,24,palette.mint);
  this.ramp(7,16,0,0,2,8,palette.cream);
  const round=this.deck(26,0,2,20,20,palette.coral,'disc');this.spinner(round,26,0,5.8,.82);
  this.ramp(36,46,0,2,4,8,palette.cream);
  for(let i=0;i<5;i++)this.deck(48+i*4,0,4.6+i*.6,4,10,i%2?palette.purple:palette.blue);
  const garden=this.deck(72,0,7.6,12,16,palette.purple);
  this.ramp(78,88,0,7.6,10,7,palette.cream);
  const hall=this.deck(94,0,10,12,18,palette.blue);this.pendulum(hall,94,0,.4);
  this.ramp(100,103,0,10,12,9,palette.blue);this.pendulum(mid,109,0,2.5);
  this.ramp(113,126,0,12,14,12,palette.cream);
  const hill=this.ramp(126,166,0,14,18,20,palette.coral);
  for(let x=132;x<=160;x+=7){const s=hill.find(s=>Math.abs(s.x-x)<4)||hill[0];this.rail(s,x,0,2,.35,.75);}
  const crest=this.deck(174,0,18,16,24,palette.cream);
  this.launcher(crest,168,-5,.5);this.launcher(crest,168,5,3.1);
  this.spinner(crest,177,0,5.6,-.72,1.3);
  const summit=this.ramp(182,207,0,18,24,6.5,palette.purple);
  const finalSpinner=summit.find(s=>s.x>193);this.spinner(finalSpinner,finalSpinner.x,0,4,.72,.9);
  // Longer side routes reconnect to the main course; players can build shortcuts.
  this.bridgeZ(43,-4,-14,3.5,6,palette.mint);
  this.ramp(43,64,-14,3.5,7,6,palette.mint);
  this.deck(69,-14,7,10,10,palette.mint,'disc');this.bridgeZ(72,-14,-8,7.6,5,palette.mint);
  this.bridgeZ(187,3.25,12,19.2,5,palette.blue);
  this.ramp(187,202,12,19.2,23,5.5,palette.blue);
  this.ramp(202,207,12,23,24,5.5,palette.blue);
  for(const [x,z,y] of [[132,-13,14.6],[146,13,16],[159,-13,17.4],[193,-7,20.6],[199,7,22]])this.deck(x,z,y,5,7,palette.mint);
  this.arch(start,5,0,13,palette.coral,'START');this.arch(finish,218,0,8,palette.mint,'FINISH');
  this.sign('01 / 旋轉廣場',26,7,-11);this.sign('02 / 天空花園',65,12,-16);
  this.sign('03 / 擺錘走廊',101,22,0);this.sign('04 / 滾石坡道',148,24,-14);this.sign('05 / 高空岔路',195,29,15);
  // Visible infrastructure: towers, planted balconies, hanging flags and clouds.
  for(const [x,z,y] of [[26,10,2],[72,7,7.6],[108,-9,12],[174,10,18],[216,-10,24]]){
   const planter=this.box(2.2,.7,2.2,palette.cream);planter.position.set(x,y+.35,z);
   const trunk=this.cylinder(.15,1.5,palette.ink);trunk.position.set(x,y+1.3,z);
   const crown=this.mesh(new T.IcosahedronGeometry(1.25,1),palette.mint);crown.position.set(x,y+2.5,z);
   const host=this.surfaces().find(s=>Math.abs(s.x-x)<.1&&Math.abs(s.courseFloor-y)<.1);if(host){for(const m of [planter,trunk,crown])this.attach(host,m);this.reserve(x,y,z,2.5,3.8,2.5);}
  }
  for(const [x,z,y] of [[54,-24,6],[126,27,15],[187,-23,22]]){
   const base=this.cylinder(3.7,11,palette.ink);base.position.set(x,y-5.5,z);
   const roof=this.mesh(new T.ConeGeometry(4.4,3.5,6),palette.purple);roof.position.set(x,y+1.75,z);
   const flag=this.box(.12,5,.12,palette.cream);flag.position.set(x,y+5,z);
   const pennant=this.box(2,.9,.08,palette.coral);pennant.position.set(x+1,y+7,z);
  }
  this.built=true;this.reset();return {start,mid,finish,garden};
 }
 pendulumPoint(f,time){const angle=.85*Math.sin(time*.95+f.phase);return V(f.x,f.y+f.height-f.length*Math.cos(angle),f.z+f.length*Math.sin(angle));}
 pose(time,physical=true){
  for(const f of this.facilities){
   if(f.type==='spinner')f.pivot.rotation.y=time*f.speed+f.phase;
   if(f.type==='pendulum')f.pivot.rotation.x=-.85*Math.sin(time*.95+f.phase);
   f.pivot?.updateMatrixWorld(true);
   if(f.type==='launcher'){const cycle=((time+f.phase)%f.interval+f.interval)%f.interval;f.light.material.emissive.setHex(cycle>f.interval-.9?0xff4b22:0x000000);f.light.material.emissiveIntensity=2;f.light.scale.setScalar(cycle>f.interval-.9?1.3:1);}
  }
  if(physical)for(const s of this.dynamicAnchors)this.updateSolidBounds(s);
 }
 rockMesh(){const mesh=this.mesh(new T.IcosahedronGeometry(1.05,1),palette.stone);const band=this.mesh(new T.TorusGeometry(1.01,.045,5,20),palette.cream,mesh);band.rotation.x=Math.PI/2;return mesh;}
 reset(){for(const r of this.rocks)this.discard(r.mesh);this.rocks=[];this.nextRock=0;this.clock=this.previousClock=0;for(const f of this.facilities)if(f.type==='launcher')f.lastCycle=Math.floor(f.phase/f.interval);this.pose(0);}
 step(dt,time){
  this.previousClock=this.clock;this.clock=time;this.pose(time);
  for(const f of this.facilities)if(f.type==='launcher'){
   const cycle=Math.floor((time+f.phase)/f.interval);
   if(cycle>f.lastCycle){f.lastCycle=cycle;const mesh=this.rockMesh();mesh.position.set(f.x-2.5,f.y+1.3,f.z);this.rocks.push({id:++this.nextRock,mesh,velocity:V(-7,0,0),age:0,previous:mesh.position.clone()});}
  }
  for(const r of this.rocks){
   r.previous.copy(r.mesh.position);r.age+=dt;
   const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
   for(let i=0;i<steps;i++){
    r.velocity.y-=22*h;r.mesh.position.addScaledVector(r.velocity,h);
    for(const hit of this.collision.sphere(r.mesh.position,1.05)){
     const inward=r.velocity.dot(hit.normal);if(inward<0)r.velocity.addScaledVector(hit.normal,-inward*(hit.normal.y>.5?1.02:1.45));
    }
    r.velocity.x*=Math.exp(-h*.035);r.velocity.clampLength(0,15);r.mesh.rotation.z-=r.velocity.x*h/1.05;
   }
  }
  this.rocks=this.rocks.filter(r=>{if(r.age<16&&r.mesh.position.y>-12&&r.mesh.position.x>123)return true;this.discard(r.mesh);return false;});
 }
 hit(p,impact){
  if(!this.built||!p.alive||p.finished||p.downTime>0||p.getUpTime>0||p.hazardCooldown>0)return;
  const a=V(p.x,p.y+.36,p.z),b=V(p.x,p.y+(p.diving?.8:1.1),p.z);
  for(const f of this.facilities){
   if(Math.abs(p.x-f.x)>f.radius+2&&f.type==='spinner')continue;
   if(f.type==='spinner'){
    const n=Math.max(1,Math.ceil(Math.abs((this.clock-this.previousClock)*f.speed)*f.radius/.15));
    for(let i=0;i<=n;i++){
     const angle=T.MathUtils.lerp(this.previousClock,this.clock,i/n)*f.speed+f.phase,dir=V(Math.cos(angle),0,-Math.sin(angle)),center=V(f.x,f.y+.82,f.z);
     if(distanceSegments(a,b,center.clone().addScaledVector(dir,-f.radius),center.clone().addScaledVector(dir,f.radius))<.64){impact(p,(p.z-f.z)*f.speed,-(p.x-f.x)*f.speed,8.5,5.2,'被旋轉棒掃倒');return;}
    }
   }else if(f.type==='pendulum'&&Math.abs(p.x-f.x)<1.8){
    const from=this.pendulumPoint(f,this.previousClock),to=this.pendulumPoint(f,this.clock);
    if(distanceSegments(a,b,from,to)<1.54){const velocity=to.clone().sub(from);impact(p,.3,Math.abs(velocity.z)>.001?velocity.z:Math.cos(this.clock*.95+f.phase),10,6,'被擺錘撞倒');return;}
   }
  }
  for(const r of this.rocks)if(distanceSegments(a,b,r.previous,r.mesh.position)<1.4){impact(p,r.velocity.x,r.velocity.z,10,5.7,'被滾石撞倒');return;}
 }
 avoid(p,input,time){
  if(!p.ground||p.grabbedBy!=null)return input;
  const safe=(x,z)=>this.surfaces().some(s=>{const q=this.supportAt(s,x,z);return q&&q.normal.y>.6&&Math.abs(q.height-p.y)<.8;});
  if(p.x>128&&p.x<163&&Math.abs(p.z)<1.7&&input.x>0){const side=p.z===0?(p.i%2?1:-1):Math.sign(p.z);if(safe(p.x+.3,p.z+side*.8))return {x:.35,z:side*.936,jump:false};}
  for(const r of this.rocks){const v=r.mesh.position;if(v.x>p.x-1&&v.x<p.x+9&&Math.abs(v.z-p.z)<2.1&&Math.abs(v.y-p.y)<3){
   let side=p.z>=v.z?1:-1;if(!safe(p.x+.7,p.z+side))side=-side;if(safe(p.x+.7,p.z+side))return {x:.25,z:side*.968,jump:false};
  }}
  for(const f of this.facilities){
   if(f.type==='spinner'&&Math.hypot(p.x-f.x,p.z-f.z)<f.radius+2&&Math.abs(p.y-f.y)<1){
    if(p.x<f.x+.5&&p.x>f.x-2.8&&Math.abs(p.z-f.z)<1.7){const side=p.z===f.z?(p.i%2?1:-1):Math.sign(p.z-f.z);if(safe(p.x+.3,p.z+side*.8))return {x:.35,z:side*.936,jump:true};}
    const angle=(time+.22)*f.speed+f.phase,center=V(f.x,f.y+.82,f.z),dir=V(Math.cos(angle),0,-Math.sin(angle));
    const here=V(p.x+input.x*1.1,f.y+.82,p.z+input.z*1.1);
    if(distanceSegments(here,here,center.clone().addScaledVector(dir,-f.radius),center.clone().addScaledVector(dir,f.radius))<1.05)return {...input,jump:true};
   }
   if(f.type==='pendulum'&&p.x<f.x-1.5&&p.x>f.x-4&&Math.abs(p.y-f.y)<1.1){
    const bob=this.pendulumPoint(f,time+.3);if(Math.abs(p.z-bob.z)<2.3&&bob.y-p.y<2.7)return {x:0,z:0,jump:false};
   }
  }
  return input;
 }
 snapshot(){return this.rocks.map(r=>({id:r.id,x:r.mesh.position.x,y:r.mesh.position.y,z:r.mesh.position.z,spin:r.mesh.rotation.z}));}
 receive(rocks,time){
  const ids=new Set(rocks.map(r=>r.id));this.rocks=this.rocks.filter(r=>{if(ids.has(r.id))return true;this.discard(r.mesh);return false;});
  for(const data of rocks){let r=this.rocks.find(r=>r.id===data.id);if(!r){r={id:data.id,mesh:this.rockMesh()};this.rocks.push(r);}r.mesh.position.set(data.x,data.y,data.z);r.mesh.rotation.z=data.spin;}
  this.clock=time;this.pose(time,false);
 }
}
