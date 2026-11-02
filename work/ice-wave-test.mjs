import {run} from './harness.mjs';
run(`
 $('count').value='6';start();assert(selection.some(s=>s.type==='ice'));
 assert(!TYPES.some(t=>t[0]==='fire'),'flamethrower removed from draft pool');
 clean();resetPlayers(6);phase='build';placed=false;players[0].pick='ice';
 const floor=addSurface('platform',30,0,0,0,14,14,true,8);
 const upper=addSurface('platform',30,0,2,0,3,3,false);
 const outside=addSurface('platform',30,0,4,0,3,3,false);
 const rotated=addSurface('cannon',31.5,1,.5,Math.PI/2);
 const point={x:30,y:0,z:0};aim=point;makeGhost();updateGhost();
 assert(legal(point,'ice'),'area placement intentionally overlaps solids');
 assert(!legal({x:120,y:40,z:40},'ice'),'empty area cannot consume the bomb');
 assert(!legal({x:NaN,y:0,z:0},'ice'),'nonfinite placement is rejected');
 assert.equal(ICE.radius,2.25);const targets=iceTargets(surfaces,point);
 assert.deepEqual(targets.map(s=>s.id),[floor.id,upper.id,rotated.id],'sphere includes vertical offsets but excludes objects above radius');
 assert.deepEqual([...ghost.userData.highlights.keys()],targets.map(s=>s.id),'preview and blast use identical targets');
 assert(!targets.some(s=>s.frozen),'preview is reversible and has no physics effects');
 const original=floor.mesh.userData.solids[0].geometry,colliders=surfaces.length;
 placeHuman();assert(placed&&players[0].built);assert.equal(ghost,null);
 assert.equal(surfaces.length,colliders,'bomb consumed without a permanent collider');
 assert(targets.every(s=>s.frozen)&&!outside.frozen);
 assert.equal(floor.mesh.userData.solids[0].geometry,original,'freezing preserves precise geometry');
 assert(floor.mesh.userData.solids[0].material.map.isDataTexture,'ice has a real frost/crack texture');
 assert.equal(freezeSurface(floor),false,'repeated snapshots do not recreate materials');
 const state=networkSnapshot();assert(state.surfaces.find(s=>s.id===floor.id).frozen);
 beginRound();assert(floor.frozen,'ice persists into the next round');
 clean();assert.equal(surfaces.length,0,'new map removes previous ice');

 function coast(frozen,fps,input={x:0,z:0,jump:false}){
  clean();const floor=addSurface('platform',30,0,0,0,50,40,true);resetPlayers(6);phase='race';practiceMode=true;
  if(frozen)freezeSurface(floor);
  const p=players[0];resetCombat(p);Object.assign(p,{x:25,y:.002,z:0,vx:7,vz:0,vy:0,ground:floor});
  for(let i=0;i<fps;i++)move(p,1/fps,input);
  return {distance:p.x-25,speed:p.vx};
 }
 const dry=coast(false,60),icyCoast=coast(true,60);
 assert(icyCoast.distance>4.8&&icyCoast.distance>dry.distance*8,'ice coasts several metres when controls are released');
 assert(icyCoast.speed>3&&dry.speed<.01,'low friction affects velocity, not just visual animation');
 const reverse=coast(true,60,{x:-1,z:0,jump:false});assert(reverse.distance>1,'opposite input brakes gradually instead of instant reversal');
 const at30=coast(true,30),at120=coast(true,120);assert(Math.abs(at30.distance-at120.distance)<.1,'slide stable across frame rates');
 const impulse=(frozen)=>{const p={x:0,z:0,impulseX:5,impulseZ:0,ground:{frozen}};for(let i=0;i<60;i++)integrateImpulse(p,1/60);return p.x;};
 assert(impulse(true)>impulse(false)*2,'punch knockback also slides farther on ice');

 clean();const base=addSurface('platform',30,0,0,0,50,40,true);resetPlayers(6);phase='race';practiceMode=false;
 const field=addSurface('field',20,0,0);field.offset=0;raceTime=2;traps(1/60);
 const wave=waves[0];assert(wave);
 function thickness(radius){setWaveRadius(wave.mesh,radius);const pos=wave.mesh.geometry.attributes.position;let min=Infinity,max=-Infinity;for(let i=0;i<pos.count;i++){const r=Math.hypot(pos.getX(i),pos.getY(i));min=Math.min(min,r);max=Math.max(max,r);}return max-min;}
 assert(Math.abs(thickness(1)-.07)<.001&&Math.abs(thickness(17)-.07)<.001,'expanding waves preserve their thin cross-section');
 wave.r=14;setWaveRadius(wave.mesh,wave.r);
 const p=players[0];resetCombat(p);Object.assign(p,{x:34,y:.002,z:0,vx:0,vz:0,vy:0,ground:base});
 move(p,1/60,{x:0,z:0,jump:false});assert(isDown(p)&&p.alive,'wave hits beyond its former 8m radius');
 const snapshot=networkSnapshot();syncRemoteEffects(snapshot);assert(Math.abs(thickness(14)-.07)<.001,'guest uses the same thin wave renderer');
 wave.r=17.8;traps(1/60);assert(waves.includes(wave),'wave remains active near new outer radius');
 wave.r=18.1;traps(1/60);assert(!waves.includes(wave),'wave expires at the displayed 18m range');
 console.log('PASS: ice preview/commit, fixed and raised platforms, material/geometry preservation, persistence, 30/60/120 FPS low-friction movement, knockback sliding, thin 18m waves and expanded hit range');
`);
