import assert from 'node:assert/strict';
import * as T from '../dist/three.module.js';
import {contactImpulse} from '../dist/facilities.js';
import {run} from './harness.mjs';
const normal=new T.Vector3(0,0,-1),v=(z)=>new T.Vector3(0,0,z);
const chasing=contactImpulse(normal,v(-6),v(-5)),headOn=contactImpulse(normal,v(-6),v(3));
assert(headOn.length()>chasing.length()*5,'relative closing speed determines force');
assert.equal(contactImpulse(normal,v(-6),v(-8)),null,'separating contact cannot launch a player');
run(`
 clean();facilities=new PlaceableFacilities({world,updateSolidBounds,collision:collisionWorld,surfaces:()=>surfaces,supportAt});
 const floor=addSurface('platform',30,25,6,0,40,40,true);resetPlayers(6);phase='race';practiceMode=false;
 const spin=addSurface('spinner',30,25,6.08);spin.offset=0;facilities.reset();const f=spin.mesh.userData.facility,p=players[0];
 function probe(radius,angle=0,speed=1.55){resetCombat(p);spin.angle=angle;spin.mesh.rotation.y=angle;f.speed=speed;facilities.pose(0);
  Object.assign(p,{x:30+Math.cos(angle)*radius-Math.sin(angle)*.5,z:25-Math.sin(angle)*radius-Math.cos(angle)*.5,y:6,vx:0,vz:0,vy:0,ground:floor,alive:true,finished:false});
  let result=null;facilities.hit(p,()=>{},(actor,impulse,velocity)=>result={impulse,velocity});return result;
 }
 const inner=probe(1),outer=probe(3.8);assert(inner&&outer);assert(outer.impulse.length()>inner.impulse.length()*2.8,'bar tip strikes harder than centre');assert(outer.impulse.z<0&&Math.abs(outer.impulse.y)<.001,'bar pushes along contact direction without preset upward launch');
 const rotated=probe(3.8,Math.PI/2);assert(rotated.impulse.x<0&&Math.abs(rotated.impulse.z)<.001,'R rotates the contact force');
 const slow=probe(3.8,0,.65);assert(slow.impulse.length()<outer.impulse.length()*.5,'slower mechanism hits more softly');
 probe(3.8);const from=new T.Vector3(p.x,p.y,p.z);p.vz=3;p.vy=0;
 collisionWorld.movePlayer(p,from,new T.Vector3(p.x,p.y,p.z+.2));assert(p.mechanismContacts.some(c=>c.surface===spin&&c.mesh&&c.point),'real mesh collision carries contact point and original velocity');
 let actual;facilities.hit(p,()=>{},(actor,impulse,velocity)=>actual={impulse,velocity});assert(actual&&actual.impulse.z<0);
 hitMechanism(p,actual.impulse,actual.velocity,'test');assert(p.ragdoll.active&&isDown(p));assert([...p.ragdoll.nodes.values()].every(n=>Math.abs(n.velocity.y)<.001),'no fixed upward kick in rigid mechanism contact');
 const pend=addSurface('pendulum',50,25,6.08);pend.offset=0;const pf=pend.mesh.userData.facility;
 const bottom=facilities.pendulumPoint(pf,0),turnTime=Math.PI/(2*3),turn=facilities.pendulumPoint(pf,turnTime);
 assert(facilities.velocityAt(pf,bottom,0).length()>Math.sqrt(2*COMBAT.knockdownEnergy));assert(facilities.velocityAt(pf,turn,turnTime).length()<.0001,'pendulum has zero swing velocity at turning point');
 const rising=facilities.velocityAt(pf,facilities.pendulumPoint(pf,.2),.2);assert(rising.y>0&&rising.z>0,'rising pendulum has correct vertical and horizontal velocity');
 console.log('PASS: actual mesh contact data, contact normals, bar radius/speed/orientation, relative closing speed, pendulum turning point and vector ragdoll impulse');
`);
