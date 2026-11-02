import {run} from './harness.mjs';
run(`
 clean();addSurface('platform',0,0,0,0,30,30,true);resetPlayers(6);phase='race';
 const p=players[0],state=p.mesh.userData.animal;
 Object.assign(p,{x:0,y:0,z:0,vx:0,vz:0,vy:0,ground:surfaces[0]});
 p.mesh.position.set(0,0,0);p.mesh.rotation.set(0,0,0);
 state.bodyPivot.rotation.set(0,0,0);state.bodyPivot.scale.set(1,1,1);p.mesh.updateMatrixWorld(true);
 const rigid=new Set(['Root','Body','Hips','Abdomen','Torso','Neck','Head','ShoulderL','ShoulderR']);
 const samples=[];
 state.animal.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;
   const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
   for(let i=0;i<position.count;i+=3){
     let valid=true;
     for(let j=0;j<4;j++)if(skinWeight.getComponent(i,j)>.0001&&!rigid.has(mesh.skeleton.bones[skinIndex.getComponent(i,j)].name))valid=false;
     if(valid){
       const point=new T.Vector3().fromBufferAttribute(position,i);
       mesh.applyBoneTransform(i,point);mesh.localToWorld(point);
       samples.push({mesh,i,point});
     }
   }
 });
 assert(samples.length>100,'inspect actual skinned chest and face vertices');
 p.lastImpactX=1;knockDown(p);
 const r=p.ragdoll,limits={UpperArm:1.5,LowerArm:1.65,UpperLeg:.8,LowerLeg:1.05,Ear1:.45,Ear2:.55};
 let maxSkinError=0,maxLengthError=0;
 for(let frame=0;frame<420;frame++){
   if(frame===90)r.grip={node:'FistL',target:new T.Vector3(1,.65,0)};
   if(frame>90&&frame<280){
     // Alternate dragging direction, height and pulling force repeatedly.
     r.grip.target.set(Math.sin(frame*.045)*3,.6+Math.max(0,Math.sin(frame*.035)),Math.cos(frame*.045)*2);
   }
   if(frame===280){r.grip=null;p.impulseX=14;p.impulseZ=-9;}
   stepRagdoll(p,1/120,collisionWorld);
   p.mesh.position.set(p.x,p.y,p.z);animateAnimal(p,1/120);p.mesh.updateMatrixWorld(true);
   for(const bind of r.binds){
     const name=bind.bone.name;
     if(name!=='Root'&&!name.startsWith('Foot')){
       maxLengthError=Math.max(maxLengthError,bind.bone.position.distanceTo(bind.position));
       assert(bind.bone.scale.distanceTo(bind.scale)<1e-8,'physics never scales '+name);
     }
     const limit=Object.entries(limits).find(([prefix])=>name.startsWith(prefix))?.[1];
     if(limit)assert(bind.bone.quaternion.angleTo(bind.quaternion)<limit+1e-6,'bounded joint swing '+name);
   }
   for(const n of r.core.nodes)for(const m of r.core.nodes){
     const reference=r.core.offsets.get(n.name).distanceTo(r.core.offsets.get(m.name));
     assert(Math.abs(n.p.distanceTo(m.p)-reference)<1e-6,'rigid torso dimensions stay fixed');
   }
   if(frame%15===0)for(const sample of samples){
     const actual=new T.Vector3().fromBufferAttribute(sample.mesh.geometry.attributes.position,sample.i);
     sample.mesh.applyBoneTransform(sample.i,actual);sample.mesh.localToWorld(actual);
     const expected=sample.point.clone().sub(r.core.restCenter).applyQuaternion(r.core.rotation).add(r.core.center);
     maxSkinError=Math.max(maxSkinError,actual.distanceTo(expected));
   }
   for(const side of ['L','R']){
     const foot=r.bindMap.get('Foot'+side),shin=r.bindMap.get('LowerLeg'+side);
     const length=foot.bone.getWorldPosition(new T.Vector3()).distanceTo(shin.bone.getWorldPosition(new T.Vector3()));
     assert(Math.abs(length-foot.world.distanceTo(shin.world))<1e-6,'ankle stays attached');
   }
 }
 assert(maxLengthError<1e-8,'local bone offsets never stretch');
 assert(maxSkinError<1e-5,'actual chest/face skin stays rigid, maximum error='+maxSkinError);
 p.downTime=0;p.getUpTime=.55;beginRecovery(p);
 for(let i=0;i<40;i++){p.getUpTime=Math.max(0,p.getUpTime-1/60);animateAnimal(p,1/60);}
 resetCombat(p);resetAnimal(p.mesh);animateAnimal(p,1/60);
 assert(!p.ragdoll&&!state.recovery,'recovery/reset clears physical root');
 console.log('PASS: '+samples.length+' actual skin vertices preserve chest/face shape; fixed bone lengths, bounded joints and attached ankles under repeated dragging/impacts; max skin error='+maxSkinError.toExponential(2));
`);
