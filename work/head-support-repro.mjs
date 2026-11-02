import {run} from './harness.mjs';
run(`
 function contacts(p){return [...p.ragdoll.nodes.values()].flatMap(n=>{
   const close=[];for(const t of collisionWorld.candidates(n.p,n.p,n.radius+.008)){
    const point=t.tri.closestPointToPoint(n.p,new T.Vector3());
    if(t.normal.y>=.5&&point.distanceTo(n.p)<=n.radius+.008&&point.y<n.p.y)close.push(n.name);
   }return [...new Set(close)];
 });}
 for(const angle of [Math.PI,Math.PI/2,Math.PI/4])for(const x of [0,2.05,2.2,2.25]){
  clean();const floor=addSurface('platform',0,0,0,0,4,8,true);resetPlayers(1);phase='race';practiceMode=true;
  const p=players[0];resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:0,y:0,z:0,vx:0,vz:0,vy:0,ground:null});p.impactSpin=0;knockDown(p);
  const r=p.ragdoll,head=r.nodes.get('Head'),pivot=head.p.clone(),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle);
  const target=new T.Vector3(x,x? .06+Math.sqrt(Math.max(0,head.radius**2-(x-2)**2)):.6,0);
  for(const n of r.nodes.values()){n.p.sub(pivot).applyQuaternion(q).add(target);n.prev.copy(n.p);n.velocity.set(0,0,0);}
  r.core.center.sub(pivot).applyQuaternion(q).add(target);r.core.rotation.copy(q);
  const body=r.nodes.get('Body');p.x=body.p.x;p.y=body.p.y-.25;p.z=body.p.z;
  let grounded=0,recovered=false;
  for(let i=0;i<360;i++){move(p,1/60,{x:0,z:0,jump:false});updateCombat(players,1/60);if(p.ground)grounded++;if(!isDown(p)){recovered=true;break;}if(!p.alive)break;}
  console.log(JSON.stringify({angle,x,alive:p.alive,recovered,grounded,ground:!!p.ground,y:p.y,down:p.downTime,contacts:contacts(p)}));
 }
`);
