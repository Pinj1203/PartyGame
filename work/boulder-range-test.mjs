import {run} from './harness.mjs';
run(`
 const distances=[];
 for(const fps of [30,60,120]){
  clean();facilities=new PlaceableFacilities({world,updateSolidBounds,collision:collisionWorld,surfaces:()=>surfaces,supportAt});
  const floor=addSurface('platform',60,25,6,0,80,30,true,3);
  const gun=addSurface('boulder',30,25,6.08);gun.offset=0;facilities.reset();
  const b=bounds(gun);assert(b.maxX-b.minX>5&&b.maxY-b.minY>3.5,'machine is visibly larger');
  const launchTime=gun.mesh.userData.facility.interval;
  facilities.step(1/fps,launchTime);const r=facilities.rocks[0];assert(r,'launch');
  assert(r.velocity.x>13&&r.velocity.x<13.34&&r.velocity.y>4,'slower horizontal shot retains its upward trajectory');
  const start=r.mesh.position.clone();
  for(let i=1;i<=fps;i++)facilities.step(1/fps,launchTime+i/fps);
  const travel=r.mesh.position.x-start.x;distances.push(travel);
  assert(travel>12&&travel<14,'slower shot travels about thirteen metres in the first second');
  assert(r.mesh.position.y>7.14,'large rolling stone stays above the solid floor');
  const wall=addSurface('platform',58,25,12,0,1,15,true,6);
  let reversed=false;
  for(let i=1;i<=fps;i++){facilities.step(1/fps,launchTime+1+i/fps);if(r.velocity.x<0)reversed=true;assert(r.mesh.position.x<57.51,'projectile cannot tunnel through the thick wall');}
  assert(reversed,'boulder collides and rebounds');
 }
 assert(Math.max(...distances)-Math.min(...distances)<.15,'consistent travel at 30/60/120 FPS');
 console.log('PASS: larger launcher, 13.3 m/s arcing shot, ~13 m travel in one second, rolling-floor contact, wall collision and frame-rate consistency');
`);
