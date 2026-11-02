import {run} from './harness.mjs';
run(`
 clean();addSurface('platform',0,0,0,0,30,30,true);resetPlayers(6);phase='race';
 const p=players[0];Object.assign(p,{x:0,y:0,z:5,vx:0,vz:0,vy:0,ground:surfaces[0]});p.mesh.position.set(0,0,5);
 p.lastImpactX=1;knockDown(p);
 for(let i=0;i<300;i++){
   stepRagdoll(p,1/120,collisionWorld);p.mesh.position.set(p.x,p.y,p.z);animateAnimal(p,1/120);
   if(i%15===14)console.log(i,p.x.toFixed(2),p.y.toFixed(3),p.ragdoll.nodes.get('Head').p.y.toFixed(3),!!p.ground,p.ragdoll.contacts,Math.max(...[...p.ragdoll.nodes.values()].map(n=>n.velocity.length())).toFixed(1));
 }
`);
