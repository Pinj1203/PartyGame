import {run} from './harness.mjs';
run(`
 clean();makeMap();resetPlayers(6);
 const a=players[0],b=players[1];
 function reset(p,speed=0,facing=0,air=false){
  resetCombat(p);resetAnimal(p.mesh);
  Object.assign(p,{x:0,y:0,z:0,vx:speed*Math.cos(facing),vy:0,vz:speed*Math.sin(facing),ground:air?null:surfaces[0],facing});
  p.mesh.position.set(0,0,0);p.mesh.rotation.set(0,-facing,0);
 }
 const rig=p=>p.mesh.userData.animal;
 const point=(p,name)=>{p.mesh.updateMatrixWorld(true);return p.mesh.worldToLocal(rig(p).bones.get(name).getWorldPosition(new T.Vector3()));};
 const lengths=(p,side)=>[point(p,'UpperArm'+side).distanceTo(point(p,'LowerArm'+side)),point(p,'LowerArm'+side).distanceTo(point(p,'Fist'+side))];
 for(const serial of [1,2]){
  const side=serial%2?'R':'L',other=side==='R'?'L':'R';reset(a);a.punchSerial=serial;
  const baseline=lengths(a,side);
  a.punchTime=COMBAT.windup*.54;animateAnimal(a,0);
  const wound=point(a,'Fist'+side);assert(wound.x<-.10,'fist visibly pulls behind the shoulder');
  a.punchTime=COMBAT.windup;animateAnimal(a,0);
  const contact=point(a,'Fist'+side);
  assert(contact.x>.48&&contact.x-wound.x>.6,'fist snaps forward at the actual hit time');
  assert(point(a,'Fist'+other).x>.15,'other hand stays in guard');
  lengths(a,side).forEach((n,i)=>assert(Math.abs(n-baseline[i])<1e-5,'IK preserves arm segment lengths'));
  a.punchTime=.29;animateAnimal(a,0);assert(point(a,'Fist'+side).x<contact.x-.2,'fist retracts after contact');
 }
 // Pose is driven by combat time, not render-frame accumulation, and is body-relative.
 for(const fps of [30,60,120])for(const air of [false,true]){
  reset(a,4,Math.PI*.67,air);reset(b,4,Math.PI*.67,air);a.punchSerial=1;
  for(let i=1;i<=Math.ceil(COMBAT.duration*fps);i++){
   a.punchTime=Math.min(COMBAT.duration,i/fps);animateAnimal(a,1/fps);animateAnimal(b,1/fps);
   for(const name of ['Body','Abdomen','UpperLegL','LowerLegR','FootL','FootR']){
    const bone=rig(a).bones.get(name),reference=rig(b).bones.get(name);
    assert(bone.quaternion.clone().normalize().angleTo(reference.quaternion.clone().normalize())<1e-5,'run/jump legs remain unchanged: '+name+' fps='+fps+' air='+air+' frame='+i+' angle='+bone.quaternion.clone().normalize().angleTo(reference.quaternion.clone().normalize()));
    assert(bone.position.distanceTo(reference.position)<1e-6);
   }
   for(const [name,bone] of rig(a).bones){
    const reference=rig(b).bones.get(name);
    assert(bone.position.distanceTo(reference.position)<1e-5,'attack never translates '+name);
    assert(bone.scale.distanceTo(reference.scale)<1e-5,'attack never stretches '+name);
    assert(Number.isFinite(bone.quaternion.w));
   }
  }
  for(const side of ['L','R'])assert(rig(a).bones.get('UpperArm'+side).quaternion.clone().normalize().angleTo(rig(b).bones.get('UpperArm'+side).quaternion.clone().normalize())<1e-5,'recovery returns to locomotion');
  a.punchTime=COMBAT.windup;animateAnimal(a,0);assert(point(a,'FistR').x>.45,'punch follows body facing after turning');
 }
 reset(a);reset(b);a.punchSerial=1;a.punchTime=.12;animateAnimal(a,1/60);
 a.punchTime=-1;resetAnimal(a.mesh);animateAnimal(a,0);animateAnimal(b,0);
 assert(rig(a).bones.get('UpperArmR').quaternion.clone().normalize().angleTo(rig(b).bones.get('UpperArmR').quaternion.clone().normalize())<1e-5,'cancelling/resetting clears attack pose');
 console.log('PASS: alternating fists, visible windup/contact/retraction, fixed limb lengths, body-relative strikes, unchanged run/jump legs at 30/60/120 FPS and clean recovery');
`);
