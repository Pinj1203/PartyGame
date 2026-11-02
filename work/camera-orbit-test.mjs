import {run} from './harness.mjs';
run(`
 clean();resetPlayers(2);phase='race';practiceMode=true;
 const p=players[0];Object.assign(p,{x:0,y:0,z:0,alive:true,finished:false});
 const anchor=new T.Vector3(),view=new T.Vector3();
 function check(target,radius,message){
  const error=Math.abs(camera.position.distanceTo(target)-radius);
  assert(error<1e-8,message+': camera radius error '+error);
  camera.getWorldDirection(view);const expected=target.clone().sub(camera.position).normalize();
  assert(view.dot(expected)>1-1e-10,message+': camera keeps looking at the target');
  assert.equal(camera.fov,44,'camera motion does not zoom the lens');
 }
 for(const fps of [30,60,120,240]){
  phase='lobby';renderFrame(1/fps);phase='race';yaw=0;pitch=PLAY_CAMERA.pitch;
  for(let i=0;i<fps;i++)renderFrame(1/fps);
  anchor.set(p.x,p.y+1.2,p.z);
  for(let i=0;i<fps*2;i++){
   yaw=Math.floor(i/4)%2?0:Math.PI;
   pitch=i<20||i%9<5?-.25:.4;
   renderFrame(1/fps);check(anchor,13,'rapid turn at '+fps+' FPS');
  }
  for(let i=0;i<fps;i++){
   p.x+=7/fps;p.y=Math.sin(i/fps*6)*2;p.z+=3/fps;
   yaw+=12/fps;pitch=-1.15;
   renderFrame(1/fps);anchor.set(p.x,p.y+1.2,p.z);
   check(anchor,13,'moving/jumping orbit at '+fps+' FPS');
  }
 }

 // Crossing +/- pi uses the short turn and stays smoothly on the same sphere.
 phase='lobby';renderFrame(1/60);phase='race';yaw=Math.PI-.01;pitch=-.25;renderFrame(1/60);
 const beforeWrap=camera.position.clone();yaw=-Math.PI+.01;renderFrame(1/60);
 assert(camera.position.distanceTo(beforeWrap)<.1,'yaw wrap never spins around the long way');
 const beforeTurn=camera.position.clone();yaw+=Math.PI/2;renderFrame(1/60);
 const travelled=camera.position.distanceTo(beforeTurn);
 assert(travelled>.1&&travelled<10,'turning retains smoothing without snapping to the final angle');
 check(anchor,13,'angle wrap and smooth turns');
 const endpoints=[];
 for(const fps of [30,60,120,240]){
  phase='lobby';renderFrame(1/fps);phase='race';yaw=0;pitch=-.25;renderFrame(1/fps);
  yaw=2;pitch=.2;for(let i=0;i<fps;i++)renderFrame(1/fps);
  endpoints.push(camera.position.clone());
 }
 for(const point of endpoints)assert(point.distanceTo(endpoints[0])<1e-9,'equal elapsed time gives the same smooth orbit at every refresh rate');
 // Guests orbit the displayed/predicted pose, not the delayed authoritative one.
 net={online:true,isGuest:true,slot:0};p.mesh.position.set(120,8,-30);
 for(let i=0;i<30;i++){
  p.mesh.position.x+=.5;rotateView(i%2?500:-500,0);
  renderFrame(1/60);anchor.copy(p.mesh.position);anchor.y+=1.2;check(anchor,13,'guest rendered pose');
 }
 p.alive=false;const watched=players[1];Object.assign(watched,{alive:true,finished:false,vx:1,vz:0});watched.mesh.position.set(80,5,22);
 renderFrame(1/60);anchor.copy(watched.mesh.position);anchor.y+=1.2;check(anchor,13,'guest spectating another player');
 net=null;p.alive=true;
 // Placement uses each object's existing preview distance, with independent rotation.
 phase='build';aim={x:20,y:8,z:4};placementYaw=.6;
 for(const type of TYPES.map(t=>t[0])){
  p.pick=type;makeGhost();updateGhost();buildView.yaw=0;buildView.pitch=-.5;renderFrame(1/60);
  const radius=camera.position.distanceTo(camTarget),rotation=ghost.quaternion.clone();
  assert(radius>=10-1e-8,'object preview remains large enough');
  for(let i=0;i<20;i++){
   rotateView(i%2?600:-600,0);renderFrame(1/60);check(camTarget,radius,'placement '+type);
   assert(ghost.quaternion.equals(rotation)&&placementYaw===.6,'orbit never rotates the placed object');
  }
 }
 clearGhost();phase='race';Object.assign(p,{x:0,y:0,z:0});yaw=0;pitch=-.25;
 addSurface('platform',-11,0,6,0,8,8,true);renderFrame(1/60);
 anchor.set(0,1.2,0);check(anchor,13,'platform clearance');
 assert(camera.position.y>=7-1e-8,'camera raises above a platform without changing its radius');
 console.log('PASS: fixed-radius camera at 30/60/120/240 FPS, rapid turns, movement/jumps, pitch, angle wrap, frame-rate-independent smoothing, guest rendered poses, spectating, all 14 placement previews and platform clearance');

`);
