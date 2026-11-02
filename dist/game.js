import * as T from './three.module.js';
import { loadCharacters, createAnimal, animateAnimal, resetAnimal } from './characters.js';
import { COMBAT, resetCombat, startPunch, updateCombat, integrateImpulse, resolvePlayerContacts, isDown, isDiving, knockDown, hazardImpact, waveImpact, mechanicalImpact, startGrab, releaseGrab, clearGrabs, updateGrabs, strugglePulse } from './combat.js';
import { CollisionWorld } from './collision.js';
import { beginRagdoll, stepRagdoll, beginRecovery } from './ragdoll.js';
import { DivePlanner } from './ai-dive.js';
import {DIVE,launchDive} from './dive.js';
import { PartyNetwork } from './network.js';
import { generateIslands, COURSE } from './island-map.js';
import {JUMP,beginJump,updateJump} from './jump.js';
import {ICE,iceTargets,freezeSurface,createIcePreview,updateIcePreview} from './ice.js';
import {WAVE,createWaveMesh,setWaveRadius} from './waves.js';
import { PlaceableFacilities, createFacilityModel, FACILITY_TYPES, contactImpulse } from './facilities.js';
import {MOVING,MOVING_TYPES,isMoving,movingPosition,movingBounds,createMovingPlatform,addMovingPreview,MovingPlatforms} from './moving-platforms.js';
import {PLAYER_FIELDS,STEP,SnapshotTimeline,LocalPredictor,interpolateActor} from './netcode.js';
const $=id=>document.getElementById(id), clamp=T.MathUtils.clamp;
const TYPES=[['platform','▰','雲朵平台','穩穩站好，搭出一條生路',0xa9d879],['rotate','◈','旋轉方塊','傾角超過 60° 會滑落',0xb09ee8],['bounce','↟','彈跳床','跳得更高，也可能飛太遠',0xf2c957],['ice','❄','冰凍炸彈','預覽 2.25m 範圍，確認後凍結物件與地板',0x95dcf5],['spike','▲','尖刺','3×3 尖刺區，碰到會彈飛',0xe888a7],['cannon','●','砲台','自動發射擊飛砲彈',0x7e9baa],['fan','✳','電風扇','順風起飛，逆風小心',0x77d3d2],['field','◎','波紋力場','水平波紋命中會原地擊倒',0x9ca5ee],['spinner','↻','水平旋轉棒','按碰撞強度擊退，強烈迎面撞擊才擊倒',0xec987c],['pendulum','♟','擺錘','槌形擺錘，上方橫軸標示擺動方向',0x7faac5],['hammer','⚒','旋轉槌子','小範圍高速旋轉，重擊會擊倒',0xe7a27b],['boulder','◉','滾石發射器','向箭頭方向發射會滾動的石球',0x8395a2]];
TYPES.push(['movingHorizontal','↔','水平移動平台','圓形平台來回移動 20m，R 改變方向',0x75ced0],['movingVertical','↕','垂直移動平台','圓形升降平台，上下移動 20m',0xb09ee8]);
const MAP={goalX:COURSE.length,goalY:COURSE.finishHeight,buildMaxX:COURSE.length-6,halfWidth:48,maxBuildY:40,raceSeconds:105};
const CANNON={speed:40,radius:.3,knockback:13.5,lift:8.775};
const MOTION={groundResponse:14,airAcceleration:5.5,turnResponse:30,maxTurnSpeed:26};
const PLAY_CAMERA={distance:13,pitch:-.25};
const info=t=>TYPES.find(v=>v[0]===t), colors=[0xf58055,0xa494eb,0x76c6bc,0xe2bd54,0xe58fb0,0x7eb478,0x6eacd7,0xc0b08c,0xb57aaf,0x9abac6];
let scene=new T.Scene();scene.background=new T.Color('#cce6e4');scene.fog=new T.Fog('#cce6e4',190,550);
let camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.1,700), renderer;
try{renderer=new T.WebGLRenderer({antialias:true});}catch(e){$('loading').textContent='無法啟動 WebGL，請開啟瀏覽器硬體加速後重新整理。';throw e;}
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;$('game').appendChild(renderer.domElement);
scene.add(new T.HemisphereLight(0xffffff,0x789b87,2.5));const sun=new T.DirectionalLight(0xfff6dd,3);sun.position.set(15,35,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:30,bottom:-30,near:1,far:100});sun.shadow.bias=-.0004;scene.add(sun);
const world=new T.Group();scene.add(world);const decor=new T.Group();scene.add(decor);
const collisionWorld=new CollisionWorld();
const divePlanner=new DivePlanner({surfaces:()=>surfaces,players:()=>players,shots:()=>shots,waves:()=>waves,collision:collisionWorld,height:walkY,motion:MOTION,dive:DIVE});
const mat=(c,extra={})=>new T.MeshStandardMaterial({color:c,roughness:.73,...extra});
function box(w,h,d,c,parent=world){let m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function sphere(r,c,parent){let m=new T.Mesh(new T.SphereGeometry(r,16,12),mat(c));parent.add(m);m.castShadow=true;return m;}
function cyl(r,h,c,parent){let m=new T.Mesh(new T.CylinderGeometry(r,r,h,18),mat(c));parent.add(m);m.castShadow=true;return m;}
function label(text,color='#203b30'){const c=document.createElement('canvas');c.width=512;c.height=128;let ctx=c.getContext('2d');ctx.fillStyle=color;ctx.font='bold 48px Arial';ctx.textAlign='center';ctx.fillText(text,256,78);let s=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));s.scale.set(4,1,1);return s;}
for(let i=0;i<28;i++){let c=new T.Group();let x=Math.sin(i*321.7)*135,z=Math.cos(i*113.1)*70;c.position.set(x+108,-7-Math.random()*9,z);for(let j=0;j<3;j++){let p=sphere(2+Math.random()*2,0xe6f4eb,c);p.scale.y=.35;p.position.x=j*2;}decor.add(c);}
const ring=new T.Mesh(new T.TorusGeometry(5,.08,8,80),mat(0xe4eee1));ring.rotation.x=Math.PI/2;ring.position.set(48,-1,0);decor.add(ring);
let surfaces=[],players=[],shots=[],waves=[],phase='lobby',remaining=0,round=0,time=0,raceTime=0,expert=true,selection=[],draftElapsed=0,buildElapsed=0,placed=false,placementYaw=0,ghost=null,aim={x:10,z:0,y:0},keys={},finishOrder=[],firstAwarded=false,muted=true,audio,yaw=0,pitch=PLAY_CAMERA.pitch;
const buildView={yaw:0,pitch:-.5};
let facilities=null,movers=null,mapSeed=null;
let practiceMode=false, practiceRoom=false, grabPractice=false, impacts=[], grabHeld=false;
let predictionPass=false;
const remoteTimeline=new SnapshotTimeline(),localPrediction=new LocalPredictor(predictStep,predictionReference);
let guestSample=null,guestCarryOffset=new T.Vector3(),effectSerial=0;
let net=null,roomClock=null,networkFrameAt=0,networkMatch=0,placementPending=false;
const localId=()=>net?.online?net.slot:0,localPlayer=()=>players[localId()];
const isBot=p=>net?.running?!net.room.members[p.i]?.human:p.i>0;
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rotateView(dx,dy,sensitivity=.005){
 if(phase==='build'){buildView.yaw+=dx*sensitivity;buildView.pitch=clamp(buildView.pitch-dy*sensitivity,-1.15,.4);}
 else if(phase==='race'){yaw+=dx*sensitivity;pitch=clamp(pitch-dy*sensitivity,-1.15,.4);}
}
function rotatePlacement(){if(phase!=='build'||placed)return;placementYaw=(placementYaw+Math.PI/2)%(Math.PI*2);updateGhost();}
function beep(freq=600,duration=.08){if(muted||predictionPass)return;try{audio??=new AudioContext();let o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=freq;g.gain.setValueAtTime(.04,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.start();o.stop(audio.currentTime+duration);}catch{}}

function model(type,w=3.6,d=3.6,h=.55){
 const g=FACILITY_TYPES.includes(type)?createFacilityModel(type):isMoving(type)?createMovingPlatform(type):new T.Group();
 if(type==='platform'){
  const deck=box(w,h,d,0xa9d879,g);deck.position.y=-h/2;deck.name='platform-deck';
  if(h>.56){deck.material.dispose();const side=mat(0x78aaa1),top=mat(0xa9d879);deck.material=[side,side,top,side,side,side];}
  for(const z of [-d/2+.05,d/2-.05]){const rim=box(w,.08,.1,0xf6f2dc,g);rim.position.set(0,.02,z);}
  for(const x of [-w/2+.05,w/2-.05]){const rim=box(.1,.08,d-.2,0xf6f2dc,g);rim.position.set(x,.02,0);}
 }else if(type==='rotate'){
  const cube=box(2.6,2.6,2.6,0xb09ee8,g);cube.name='rotating-cube';
  for(const x of [-1,1]){const ax=cyl(.2,.25,0x6c657f,g);ax.rotation.z=Math.PI/2;ax.position.x=x*1.4;}
 }else if(type==='bounce'){
  const pad=cyl(1.08,.15,0xffdd63,g);pad.position.y=.25;
  const rim=new T.Mesh(new T.TorusGeometry(1.16,.12,8,32),mat(0x526c62));rim.rotation.x=Math.PI/2;rim.position.y=.24;g.add(rim);
  for(const x of [-.75,.75])for(const z of [-.75,.75]){const leg=cyl(.08,.4,0x50695e,g);leg.position.set(x,-.04,z);}
 }else if(type==='spike'){
  for(let z=-1;z<=1;z++){
   const rail=box(3,.15,.18,0xa96d89,g);rail.position.set(0,.05,z);
   for(let x=-1;x<=1;x++){
    const spike=new T.Mesh(new T.ConeGeometry(.44,.95,4),mat(0xf5f2e9));spike.name='spike-tip';
    spike.position.set(x,.6,z);spike.castShadow=true;g.add(spike);
   }
  }
  for(const x of [-1,1]){const rail=box(.18,.15,3,0xa96d89,g);rail.position.set(x,.05,0);}
 }else if(type==='cannon'){
  const body=box(1.05,.95,1.15,0x54756b,g);body.position.set(-.3,.475,0);g.userData.base=body;
  const barrel=cyl(.36,1.65,0x344d4d,g);barrel.rotation.z=Math.PI/2;barrel.position.set(.35,.9,0);
 }else if(type==='fan'){
  const housing=cyl(.8,.7,0x77d3d2,g);housing.rotation.z=Math.PI/2;housing.position.y=1;
  const trim=new T.Mesh(new T.TorusGeometry(.8,.08,8,32),mat(0xe7f3d0));trim.rotation.y=Math.PI/2;trim.position.set(.38,1,0);g.add(trim);
  const blades=new T.Group();blades.position.set(.42,1,0);
  for(let a=0;a<4;a++){const blade=box(.08,1.3,.15,0x416b63,blades);blade.rotation.x=a*Math.PI/2;blade.userData.effect=true;}
  g.add(blades);g.userData.blades=blades;
  const stem=box(.18,.6,.18,0x47655f,g);stem.position.y=.3;
  const foot=box(.7,.12,.35,0x47655f,g);foot.position.y=.06;
 }else if(type==='field'){
  const hub=cyl(.6,.4,0x535a93,g);hub.position.y=.2;
  const ring=new T.Mesh(new T.TorusGeometry(.67,.1,8,32),mat(0xc7bfff,{emissive:0x675fc3,emissiveIntensity:.6}));
  ring.rotation.x=Math.PI/2;ring.position.y=.35;g.add(ring);
 }
 g.userData.solids=[];
 g.traverse(o=>{if(o.isMesh&&!o.userData.effect){o.castShadow=true;o.receiveShadow=true;g.userData.solids.push(o);}});
 g.updateMatrixWorld(true);
 const localBox=new T.Box3();
 for(const mesh of g.userData.solids)localBox.union(new T.Box3().setFromObject(mesh));
 if(g.userData.facility)localBox.union(g.userData.facility.envelope);
 g.userData.localBounds=localBox;
 return g;
}
const shapeCache=new Map(),jumpLinks=new WeakMap();
function shapeBounds(type,w=3.6,d=3.6,h=.55){
 const key=type+':'+w+':'+d+':'+h;
 if(!shapeCache.has(key)){
  const g=model(type,w,d,h);shapeCache.set(key,g.userData.localBounds.clone());
  g.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of new Set(Array.isArray(o.material)?o.material:[o.material]))m.dispose();});
 }
 return shapeCache.get(key);
}
function updateSolidBounds(s){
 s.walkHeight=null;
 collisionWorld.update(s);
}


function addSurface(type,x,z,y=0,angle=0,w=3.6,d=3.6,fixed=false,h=.55){
 const mesh=model(type,w,d,h);mesh.position.set(x,y,z);mesh.rotation.y=angle;world.add(mesh);
 const size=mesh.userData.localBounds.getSize(new T.Vector3());
 const s={id:surfaces.length,type,x,z,y,w:size.x,d:size.z,designWidth:w,designDepth:d,designHeight:h,angle,mesh,fixed,offset:Math.random()*3,lastShot:-3,lastWave:-3,worldBounds:new T.Box3()};
 updateSolidBounds(s);surfaces.push(s);facilities?.add(s);movers?.add(s);return s;
}
function ext(s){if(isMoving(s))return {x:MOVING.radius,z:MOVING.radius};const c=Math.abs(Math.cos(s.angle)),n=Math.abs(Math.sin(s.angle));return {x:(s.w*c+s.d*n)/2,z:(s.d*c+s.w*n)/2};}
function contains(s,x,z,margin=0){
 const b=s.worldBounds;
 return x>b.min.x-margin&&x<b.max.x+margin&&z>b.min.z-margin&&z<b.max.z+margin;
}
const supportRay=new T.Raycaster(),down=new T.Vector3(0,-1,0),normalMatrix=new T.Matrix3();
function supportAt(s,x,z){
 if(!contains(s,x,z))return null;
 supportRay.set(new T.Vector3(x,s.worldBounds.max.y+2,z),down);
 const hit=supportRay.intersectObjects(s.mesh.userData.solids,false)[0];
 if(!hit)return null;
 const normal=hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
 return {height:hit.point.y,normal};
}
function floorAt(s,x,z){return supportAt(s,x,z)?.height??-Infinity;}
function walkY(s){if(s.walkHeight!=null)return s.walkHeight;const h=floorAt(s,s.x,s.z);return s.walkHeight=Number.isFinite(h)?h:s.worldBounds.max.y;}

function character(i){const g=createAnimal(colors[i]);let name=label(i===0?'YOU':['MOCHI','NOVA','KIWI','MISO','BOLT','LUNA','TOFU','PEPPER','BEAN'][i-1]);name.position.y=2.4;name.scale.set(2.4,.6,1);g.add(name);g.userData.nameLabel=name;world.add(g);return g;}
function clean(){remoteTimeline.reset();localPrediction.reset();guestSample=null;guestCarryOffset.set(0,0,0);facilities=null;movers=null;grabHeld=false;grabPractice=false;clearGrabs(players);collisionWorld.clear();for(const p of players)p.mesh.userData.dispose?.();impacts=[];for(const s of [...shots,...waves]){world.remove(s.mesh);}shots=[];waves=[];while(world.children.length){const o=world.children[0];world.remove(o);o.traverse(v=>{v.geometry?.dispose();if(v.material){for(const m of Array.isArray(v.material)?v.material:[v.material]){m.map?.dispose();m.dispose();}}});}surfaces=[];players=[];ghost=null;}

// Seeded maps can contain just start and finish; practice layouts use the original third slot.
function goalSurface(){
 const islands=surfaces.filter(s=>s.fixed&&Number.isFinite(s.routeIndex));
 return islands.reduce((goal,s)=>!goal||s.routeIndex>goal.routeIndex?s:goal,null)??surfaces[2];
}
function makeMap(seed=(Math.random()*4294967296)>>>0){
 mapSeed=seed>>>0;
 movers=new MovingPlatforms({updateSolidBounds,collision:collisionWorld,players:()=>players});
 facilities=new PlaceableFacilities({world,updateSolidBounds,collision:collisionWorld,surfaces:()=>surfaces,supportAt});
 const layout=generateIslands(mapSeed);
 for(const p of layout){const s=addSurface('platform',p.x,p.z,p.y,0,p.w,p.d,true,p.h);s.routeIndex=p.routeIndex;}
 const heights=layout.map(s=>s.y);
 $('previewNote').innerHTML='● RANDOM SKY ISLANDS<br><small>'+layout.length+' 座浮島 · 搭建跨越缺口 · 高度 '+Math.min(...heights).toFixed(0)+'～'+Math.max(...heights).toFixed(0)+' 公尺</small>';
 const gate=new T.Group();
 for(const z of [-4,4]){const p=box(.4,6,.4,0x325d4d,gate);p.position.set(0,3,z);}
 const top=box(.4,.7,8.4,0xc9f96a,gate);top.position.y=5.7;
 const finish=label('FINISH');finish.position.set(0,5.7,0);gate.add(finish);
 gate.position.set(MAP.goalX+2,MAP.goalY,0);world.add(gate);
 for(const m of [...gate.children])if(m.isMesh){m.position.x+=2;goalSurface().mesh.add(m);goalSurface().mesh.userData.solids.push(m);}
 updateSolidBounds(goalSurface());
 for(const z of [-6,6]){const p=box(.18,3,.18,0xf9faec,surfaces[0].mesh);p.position.set(5,1.5,z);const flag=box(1,.7,.06,0xf09369,surfaces[0].mesh);flag.position.set(5.5,2.6,z);surfaces[0].mesh.userData.solids.push(p,flag);}
 updateSolidBounds(surfaces[0]);
 for(const s of surfaces.slice(1)){const l=label('↑ '+s.y.toFixed(1)+'m','#648479');l.position.set(s.x,s.y-s.designHeight-1,s.z);world.add(l);}
}


function resetPlayers(n){for(let i=0;i<n;i++){let p={i,name:i===0?'你':['Mochi','Nova','Kiwi','Miso','Bolt','Luna','Tofu','Pepper','Bean'][i-1],mesh:character(i),score:0,delta:0,x:0,z:0,y:0,vx:0,vz:0,vy:0,alive:true,finished:false,ground:null,pick:null,plan:[],think:0,jumpCD:0,wait:0,personality:.8+Math.random()*.4};players.push(p);}spawn();}
function spawn(){grabHeld=false;clearGrabs(players);players.forEach((p,i)=>{resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:-2+(i%3)*1.1,z:-3+Math.floor(i/3)*1.7,y:.05,vx:0,vz:0,vy:0,alive:true,finished:false,ground:surfaces[0],plan:[],think:0,jumpCD:0,delta:0,roundKnockouts:0,noRoute:0,giveUp:false,aiHopRunup:null,launchSurface:null});p.mesh.visible=true;p.mesh.position.set(p.x,p.y,p.z);});finishOrder=[];}
function show(id,b){$(id).hidden=!b;}
function scores(){ $('scores').innerHTML=[...players].sort((a,b)=>b.score-a.score).map(p=>`<div class="score ${p.i===localId()?'me':''}"><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${html(p.name)}<span>${p.finished?'⚑':!p.alive?'×':''}</span><b>${p.score}</b></div>`).join('');}
function setPhase(p,sec,title,hint){phase=p;if(!canLockMouse())unlockMouse();syncMouseLock();remaining=sec;$('phaseLabel').textContent=title;$('phaseHint').textContent=hint;$('status').textContent='';$('roundLabel').textContent=practiceRoom?'自由練習 · 1 人':`ROUND ${String(round).padStart(2,'0')} / 08`;scores();}
function start(){practiceMode=false;practiceRoom=false;const seed=mapSeed??((Math.random()*4294967296)>>>0);clean();makeMap(seed);expert=$('difficulty').value==='expert';resetPlayers(+$('count').value);round=0;show('lobby',false);show('previewNote',false);show('hud',true);beginRound();}
function beginRound(){round++;movers?.reset();spawn();players.forEach(p=>{p.pick=null;p.built=false;});show('results',false);show('buildTools',false);selection=[];const n=players.length,platformCount=1+Math.floor(Math.random()*3);for(let i=0;i<n+2;i++){let t=i<platformCount?'platform':i===platformCount?FACILITY_TYPES[(round-1)%FACILITY_TYPES.length]:i===platformCount+1?'ice':i===platformCount+2?MOVING_TYPES[(round-1)%2]:TYPES[1+Math.floor(Math.random()*(TYPES.length-1))][0];selection.push({type:t,owner:null});}selection.sort(()=>Math.random()-.5);draftElapsed=0;setPhase('draft',12,'搶物件','選一件道具。AI 也在等著出手！');show('draft',true);renderDraft();$('controls').textContent='滑鼠點擊搶物件 · 每人一件';$('aiNote').textContent='浮島之間有大缺口；逐回合搭路，也能放機關干擾對手。';}
function renderDraft(){$('draftEyebrow').textContent=practiceRoom?'PRACTICE / ALL OBJECTS':'MAKE YOUR MOVE';$('draftTitle').textContent=practiceRoom?'選個物件，開始試玩。':'手快有，手慢沒。';$('draftHint').textContent=practiceRoom?'全部 '+TYPES.length+' 種 · 可重複放置 · 不限時間':'每人搶一件，灰色物件已被拿走。';show('closePracticePicker',practiceRoom);$('items').innerHTML=selection.map((s,i)=>{let t=info(s.type);return `<button class="item" data-item="${i}" ${s.owner!==null||localPlayer().pick?'disabled':''}><span class="glyph" style="color:#${t[4].toString(16)}">${t[1]}</span><strong>${t[2]}</strong><small>${t[3]}</small><span class="owner">${s.owner!==null?players[s.owner].name:''}</span></button>`;}).join('');$('items').querySelectorAll('button').forEach(b=>b.onclick=()=>claim(localPlayer(),+b.dataset.item));}
function claim(p,i){if(practiceRoom){if(p===localPlayer())choosePracticeObject(i);return;}if(net?.isGuest){net.send({type:'command',command:'claim',index:i,round});return;}if(phase!=='draft'||p.pick||selection[i]?.owner!==null)return;selection[i].owner=p.i;p.pick=selection[i].type;beep(p.i?300:750);renderDraft();advanceWhenReady();}
function aiPick(p){let available=selection.map((s,i)=>({...s,i})).filter(s=>s.owner===null);available.sort((a,b)=>pickValue(b.type,p)-pickValue(a.type,p));if(available[0])claim(p,available[0].i);}
function pickValue(t,p){return (isMoving(t)?7:t==='platform'?round<3?8:4:t==='bounce'?5:t==='fan'?3:2)+Math.random()*3;}
let startingRace=false;
function advanceWhenReady(){
 if(practiceRoom||net?.isGuest||startingRace||!players.length)return;
 if(phase==='draft'&&players.every(p=>p.pick))beginBuild();
 else if(phase==='build'&&players.every(p=>p.built))beginRace();
}
function canSkipAIRound(){return phase==='race'&&!practiceMode&&(!net?.online||net.isHost)&&players.some(p=>isBot(p)&&p.alive&&!p.finished)&&!players.some(p=>!isBot(p)&&p.alive&&!p.finished);}
function skipAIRound(){if(!canSkipAIRound())return false;endRound();if(round<8)beginRound();return true;}
function beginBuild(){placementPending=false;show('draft',false);setPhase('build',15,'搭出你的勝算','點擊畫面鎖定滑鼠；Esc 解除。滑鼠轉鏡頭、R 轉物件。綠色可放。');show('buildTools',true);placed=false;placementYaw=0;buildElapsed=0;$('height').value='0';$('pickedName').textContent=info(localPlayer().pick)[2];$('ready').disabled=false;$('ready').textContent='確認放置 ✓';makeGhost();aim=suggest(localPlayer().pick);buildView.yaw=0;buildView.pitch=-.5;updateGhost();$('controls').textContent='滑鼠轉鏡頭 · WASD 移動 · Space ↑ Ctrl ↓ · R 轉物件 · Enter 放置';$('aiNote').textContent=localPlayer().pick==='ice'?'球形範圍碰到的整件物件會結冰；白框是預計凍結的目標。':'AI 正在評估缺口與替代路線，建議位置也可交給 AI。';}
function clearGhost(){if(!ghost)return;world.remove(ghost);ghost.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of new Set(Array.isArray(o.material)?o.material:[o.material]))m.dispose();});ghost=null;}
function makeGhost(){clearGhost();ghost=localPlayer().pick==='ice'?createIcePreview():model(localPlayer().pick);if(!ghost.userData.icePreview)ghost.traverse(o=>{if(o.material){const clone=m=>{const c=m.clone();c.transparent=true;c.opacity=.5;c.depthWrite=false;return c;};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}});if(isMoving(localPlayer().pick))addMovingPreview(ghost,localPlayer().pick);world.add(ghost);}
function placeObject(type,a,angle){if(type==='ice'){const targets=iceTargets(surfaces,a);targets.forEach(freezeSurface);return targets.length;}return addSurface(type,a.x,a.z,a.y,angle);}


function bounds(s){
 if(s.placementBounds)return s.placementBounds;
 const localBox=isMoving(s)?movingBounds(s.type):shapeBounds(s.type,s.type==='platform'?(s.designWidth??s.w):3.6,s.type==='platform'?(s.designDepth??s.d):3.6,s.designHeight??.55).clone();
 if(s.type==='rotate'){localBox.min.set(-1.55,-1.85,-1.85);localBox.max.set(1.55,1.85,1.85);}
 const origin=s.motionOrigin??s;
 const m=new T.Matrix4().compose(new T.Vector3(origin.x,origin.y,origin.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),s.angle),new T.Vector3(1,1,1));
 const b=localBox.applyMatrix4(m);
 const result={minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};if(s.mesh)s.placementBounds=result;return result;
}
function legal(a,t=localPlayer()?.pick,angle=placementYaw){
 if(!a||![a.x,a.y,a.z,angle].every(Number.isFinite))return false;
 if(a.x<7||a.x>MAP.buildMaxX||Math.abs(a.z)>MAP.halfWidth||a.y<-.5||a.y>MAP.maxBuildY)return false;
 if(t==='ice')return iceTargets(surfaces,a).length>0;
 if(isMoving(t)){const end=movingPosition({...a,type:t,angle},MOVING.period/2);if(end.x<7||end.x>MAP.buildMaxX||Math.abs(end.z)>MAP.halfWidth||end.y>MAP.maxBuildY)return false;}
 const q=bounds({type:t,x:a.x,z:a.z,y:a.y,w:3.6,d:3.6,angle});
 return !surfaces.some(s=>{const r=bounds(s);return q.minX<r.maxX-.02&&q.maxX>r.minX+.02&&q.minY<r.maxY-.02&&q.maxY>r.minY+.02&&q.minZ<r.maxZ-.02&&q.maxZ>r.minZ+.02;});
}

function updateGhost(){if(!ghost)return;
 $('rotate').disabled=!!ghost.userData.icePreview;ghost.position.set(aim.x,aim.y,aim.z);ghost.rotation.y=ghost.userData.icePreview?0:placementYaw;const ok=legal(aim);
 const coords='X '+aim.x.toFixed(1)+' · Y '+aim.y.toFixed(1)+' · Z '+aim.z.toFixed(1);
 if(ghost.userData.icePreview){const targets=iceTargets(surfaces,aim);updateIcePreview(ghost,targets,aim,ok);$('coords').textContent=coords+' · 半徑 '+ICE.radius+'m · 凍結 '+targets.length+' 件';}
 else{$('coords').textContent=coords+' · 物件 '+Math.round(placementYaw*180/Math.PI)+'°'+(isMoving(localPlayer().pick)?' · 單程 '+MOVING.travel+'m · 虛線是移動路徑':'');ghost.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.color.setHex(ok?0x72d485:0xf06a67);});}
}
function placementError(type){return type==='ice'?'將範圍移到尚未凍結的物件上。':'與地形或設施運作範圍重疊，換個位置或高度。';}

function reachablePlatforms(){
 const reach=new Set([surfaces[0]]),queue=[surfaces[0]];
 while(queue.length){const s=queue.shift();for(const v of surfaces)if(!reach.has(v)&&v.type!=='spike'&&canTraverse(s,v)){reach.add(v);queue.push(v);}}
 return reach;
}
function suggest(type,angle=placementYaw){
 if(type==='ice'){
  const candidates=surfaces.filter(s=>!s.frozen).map(s=>({x:clamp(s.x,7,MAP.buildMaxX),z:s.z,y:clamp(walkY(s)+.2,-.5,MAP.maxBuildY)})).filter(a=>legal(a,type,angle));
  candidates.sort((a,b)=>iceTargets(surfaces,b).length-iceTargets(surfaces,a).length);return candidates[0]??{x:12,y:0,z:0};
 }

 if(FACILITY_TYPES.includes(type))return suggestFacility(type,angle);
 if(isMoving(type))return suggestMoving(type,angle);
 const reach=reachablePlatforms();
 const ordered=surfaces.filter(s=>s.fixed&&s.routeIndex!=null).sort((a,b)=>a.routeIndex-b.routeIndex);
 const target=ordered.find(s=>!reach.has(s))??goalSurface();
 let best=null,bestScore=-Infinity;
 for(const s of reach){
  if(s.type!=='platform'&&s.type!=='bounce')continue;
  const top=walkY(s),rise=clamp(walkY(target)-top,-1.2,1.1);
  const heading=Math.atan2(target.z-s.z,target.x-s.x),e=ext(s);
  for(const turn of [0,.5,-.5,1,-1,1.55,-1.55,2.2,-2.2]){
   const a=heading+turn,dx=Math.cos(a),dz=Math.sin(a);
   const edge=Math.min(Math.max(.5,e.x-.65)/Math.max(.001,Math.abs(dx)),Math.max(.5,e.z-.65)/Math.max(.001,Math.abs(dz)));
   for(const step of [3.6,4.8,6])for(const dy of [rise,rise*.5,0]){
    const p={x:Math.round((s.x+dx*(edge+step))*10)/10,z:Math.round((s.z+dz*(edge+step))*10)/10,y:Math.round((top+dy)*10)/10};
    if(!legal(p,type,angle))continue;
    const q={...p,w:3.6,d:3.6,angle:0};
    if(gap(s,q)>jumpReach(p.y-top)||p.y-top>1.2)continue;
    if(collisionWorld.capsule(new T.Vector3(p.x,p.y+.37,p.z),new T.Vector3(p.x,p.y+1.11,p.z),.36,1).length)continue;
    if(!jumpClear(s,{...q,type:'platform',designWidth:3.6,designDepth:3.6,designHeight:.55},false))continue;
    const remaining=gap(q,target),height=Math.abs(p.y-walkY(target));
    // Price vertical work explicitly so tall walls lead to a stair route
    // around the side, instead of repeatedly building along a fixed slope.
    const score=-remaining-height*4.5-Math.abs(turn)*.12+p.x*.004;
    if(score>bestScore){bestScore=score;best=p;}
   }
  }
 }
 if(best)return best;
 for(let y=2;y<MAP.maxBuildY;y+=2)for(let z=-36;z<=36;z+=6){const p={x:12,y,z};if(legal(p,type,angle))return p;}
 return {x:12,y:MAP.maxBuildY,z:40};
}
function suggestMoving(type,angle=0){
 const reachable=[...reachablePlatforms()].sort((a,b)=>b.x-a.x);
 for(const s of reachable){
  if(FACILITY_TYPES.includes(s.type)||s.type==='spike')continue;
  for(const side of [0,Math.PI/2,-Math.PI/2,Math.PI])for(const gap of [.35,1,2]){
   const dx=Math.cos(side),dz=Math.sin(side),e=ext(s);
   const edge=isMoving(s)?MOVING.radius:Math.min(e.x/Math.max(.001,Math.abs(dx)),e.z/Math.max(.001,Math.abs(dz)));
   const a={x:s.x+dx*(edge+MOVING.radius+gap),y:walkY(s)+.06,z:s.z+dz*(edge+MOVING.radius+gap)};
   if(legal(a,type,angle))return a;
  }
 }
 for(const y of [0,5,12,18])for(const z of [0,15,-15,30,-30])for(let x=12;x<=MAP.buildMaxX;x+=8){const a={x,y,z};if(legal(a,type,angle))return a;}
 return {x:12,y:18,z:40};
}
function suggestFacility(type,angle=0){
 const reachable=[surfaces[0],...route(surfaces[0],players[0])];
 const frontier=Math.max(...reachable.map(s=>s.x));
 const floors=surfaces.filter(s=>s.type==='platform').sort((a,b)=>Math.abs(a.x-frontier-15)-Math.abs(b.x-frontier-15));
 for(const s of floors)for(const dx of [0,2,-2])for(const dz of [0,4,-4,7,-7]){
  const x=s.x+dx,z=s.z+dz,y=floorAt(s,x,z)+.08;if(!Number.isFinite(y))continue;
  const a={x,y,z}; // Moving heads can overhang a platform; legal() reserves their full sweep.
  if(legal(a,type,angle))return a;
 }
 for(const y of [5,12,20,30])for(const z of [24,-24,36,-36])for(let x=15;x<=MAP.buildMaxX;x+=8){const a={x,y,z};if(legal(a,type,angle))return a;}
 return {x:15,z:24,y:5};
}
function placeHuman(){if(net?.isGuest){if(phase!=='build'||placed||placementPending)return;if(!legal(aim)){$('status').textContent=placementError(localPlayer().pick);return;}placementPending=true;net.send({type:'command',command:'place',...aim,angle:placementYaw,round});$('ready').disabled=true;$('status').textContent='正在確認放置…';return;}if(phase!=='build'||placed)return;if(!legal(aim)){$('status').textContent=placementError(localPlayer().pick);return;}const frozenCount=placeObject(localPlayer().pick,aim,placementYaw);localPlayer().built=true;placed=true;clearGhost();$('status').textContent=localPlayer().pick==='ice'?'已凍結 '+frozenCount+' 件物件！冰面會持續保留。':'已放置！等待其他玩家，準備出發。';$('ready').disabled=true;$('ready').textContent='已放置 ✓';beep(850);if(practiceRoom){const message=localPlayer().pick==='ice'?'已凍結 '+frozenCount+' 件物件！按 P 可繼續選擇。':'已放置！按 P 可繼續加入物件。';resumePracticeRoom(message);return;}advanceWhenReady();}
function aiBuild(p){let angle=p.pick==='boulder'?Math.PI:0,a=suggest(p.pick,angle);if(!legal(a,p.pick,angle)){p.built=true;advanceWhenReady();return;}placeObject(p.pick,a,angle);p.built=true;advanceWhenReady();}
function beginRace(){if(practiceRoom||phase!=='build'||startingRace)return;startingRace=true;if(!placed){if(!legal(aim))aim=suggest(localPlayer().pick);placeHuman();}for(let p of players.slice(1))if(!p.built)aiBuild(p);clearGhost();show('buildTools',false);setPhase('race',MAP.raceSeconds,'跑起來！','抵達終點或把對手擊落都能得分。拳擊只擊退；物理機關超過撞擊門檻才擊倒，落地後起身；掉進雲海淘汰。');spawn();raceTime=0;facilities?.reset();movers?.reset();yaw=0;pitch=PLAY_CAMERA.pitch;for(let s of surfaces){s.lastShot=-3;s.lastWave=-3;}$('controls').textContent='滑鼠轉視角 · WASD 移動 · Space 短／長跳・掙脫 · Shift 飛撲 · 左鍵拳 · 右鍵抓';$('aiNote').textContent='高手 AI：動態尋路 → 預測落點與煞停 → 跳躍／飛撲 → 避開危險。';beep(1000,.2);startingRace=false;}
function gap(a,b){
 if(isMoving(a)&&isMoving(b))return Math.max(0,Math.hypot(a.x-b.x,a.z-b.z)-MOVING.radius*2);
 if(isMoving(a)||isMoving(b)){const disk=isMoving(a)?a:b,rect=disk===a?b:a,e=ext(rect);return Math.max(0,Math.hypot(Math.max(0,Math.abs(disk.x-rect.x)-e.x),Math.max(0,Math.abs(disk.z-rect.z)-e.z))-MOVING.radius);}
 let ea=ext(a),eb=ext(b);return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-ea.x-eb.x),Math.max(0,Math.abs(a.z-b.z)-ea.z-eb.z));
}
function movingForecast(s,time){if(!isMoving(s))return s;const pos=movingPosition(s,time);return {...s,x:pos.x,y:pos.y,z:pos.z,walkHeight:pos.y};}
const movingLinks=new WeakMap();
function timedPlatformLink(a,b){
 let links=movingLinks.get(a);if(!links)movingLinks.set(a,links=new Map());
 const saved=links.get(b);if(saved?.version===surfaces.length)return saved.reachable;
 let reachable=false;
 // Platforms share a deterministic cycle. Test simultaneous departure and
 // arrival positions, rather than connecting unrelated extrema of the paths.
 for(let t=0;t<MOVING.period;t+=.25){
  if(canJump(movingForecast(a,t),movingForecast(b,t+.7))){reachable=true;break;}
 }
 links.set(b,{version:surfaces.length,reachable});return reachable;
}
function inheritPlatformMotion(p,s){if(!isMoving(s))return;const v=s.motionVelocity;p.vx+=v.x;p.vy+=v.y;p.vz+=v.z;}
function safePlatformPoint(s,x,z,margin=.6){
 if(isMoving(s)){const dx=x-s.x,dz=z-s.z,d=Math.hypot(dx,dz)||1,k=Math.min(1,(MOVING.radius-margin)/d);return {x:s.x+dx*k,z:s.z+dz*k};}
 const e=ext(s);return {x:clamp(x,s.x-e.x+margin,s.x+e.x-margin),z:clamp(z,s.z-e.z+margin,s.z+e.z-margin)};
}
function waitForPlatform(p,target){
 const spot=safePlatformPoint(p.ground,target.x,target.z,1.25),dx=spot.x-p.x,dz=spot.z-p.z,d=Math.hypot(dx,dz);
 return {x:d>.15?dx/d*Math.min(.5,d*1.5):0,z:d>.15?dz/d*Math.min(.5,d*1.5):0,jump:false};
}
function jumpReach(dy){
 const discriminant=96.04-44*dy;if(discriminant<=0)return 0;
 const flight=(JUMP.speed+Math.sqrt(discriminant))/22,launchSpeed=7*JUMP.takeoffScale,slow=Math.min(flight,(launchSpeed-3)/5.5);
 return Math.min(4.4,launchSpeed*slow-2.75*slow*slow+3*(flight-slow)-1.25);
}
function canJump(a,b){
 const dy=walkY(b)-walkY(a);
 if(a.type!=='bounce')return gap(a,b)<=jumpReach(dy)&&dy<=1.45&&dy>-4;
 if(dy>3.6||dy<-8)return false;
 const e=ext(b),dx=Math.max(0,Math.abs(a.x-b.x)-Math.max(0,e.x-.55)),dz=Math.max(0,Math.abs(a.z-b.z)-Math.max(0,e.z-.55));
 const flight=(14+Math.sqrt(196-44*dy))/22;
 return Math.hypot(dx,dz)<7*flight-.65;
}
function jumpClear(a,b,cache=true){
 if(a.type!=='platform'||b.type!=='platform')return true;
 let links=jumpLinks.get(a);if(!links)jumpLinks.set(a,links=new Map());
 const stored=links.get(b);if(cache&&stored?.version===surfaces.length)return stored.clear;
 const ea=ext(a),eb=ext(b),margin=.65;
 const from={x:clamp(b.x,a.x-ea.x+margin,a.x+ea.x-margin),z:clamp(b.z,a.z-ea.z+margin,a.z+ea.z-margin)};
 const to={x:clamp(from.x,b.x-eb.x+margin,b.x+eb.x-margin),z:clamp(from.z,b.z-eb.z+margin,b.z+eb.z-margin)};
 const ya=walkY(a),yb=b.mesh?walkY(b):b.y;
 let clear=true;
 for(let i=0;i<=14;i++){
  const t=i/14,x=T.MathUtils.lerp(from.x,to.x,t),z=T.MathUtils.lerp(from.z,to.z,t),y=T.MathUtils.lerp(ya,yb,t)+Math.sin(Math.PI*t)*2.05;
  const hits=collisionWorld.capsule(new T.Vector3(x,y+.37,z),new T.Vector3(x,y+1.11,z),.36,1);
  if(hits.some(h=>h.surface!==a&&h.surface!==b)){clear=false;break;}
 }
 if(cache)links.set(b,{version:surfaces.length,clear});return clear;
}
function canTraverse(a,b){if(FACILITY_TYPES.includes(a.type)||FACILITY_TYPES.includes(b.type))return false;if(isMoving(a)||isMoving(b))return timedPlatformLink(a,b);return (canJump(a,b)&&jumpClear(a,b))||!!divePlanner.link(a,b,expert?7:6.4);}
function route(start,p){const goal=goalSurface(),dist=new Map([[start,0]]),prev=new Map(),open=new Set([start]);while(open.size){let u=[...open].sort((a,b)=>dist.get(a)-dist.get(b))[0];open.delete(u);if(u===goal)break;for(let v of surfaces){if(v===u||v.type==='spike'||!canTraverse(u,v))continue;let risk=v.type==='platform'?0:v.type==='bounce'?.6:v.type==='fan'?1.8:expert?5:1;let cost=dist.get(u)+Math.hypot(u.x-v.x,u.z-v.z)+risk*p.personality+(canJump(u,v)?0:3)+(v.x<u.x?8:0);if(cost<(dist.get(v)??Infinity)){dist.set(v,cost);prev.set(v,u);open.add(v);}}}if(!dist.has(goal)){let candidates=[...dist.keys()].filter(s=>s.type!=='spike');let far=candidates.sort((a,b)=>b.x-a.x)[0];return recover(far,prev,start);}return recover(goal,prev,start);}
function recover(end,prev,start){let out=[],u=end;for(let i=0;u&&u!==start&&i<100;i++){out.unshift(u);u=prev.get(u);}return out;}
function local(s,p){let dx=p.x-s.x,dz=p.z-s.z;return {x:dx*Math.cos(s.angle)-dz*Math.sin(s.angle),z:dx*Math.sin(s.angle)+dz*Math.cos(s.angle)};}
function aiAirInput(p,target,dt){
 if(isDiving(p))return {x:0,z:0,jump:false};
 if(isMoving(target)){
  let flight=.4;
  for(let i=0;i<3;i++){const future=movingForecast(target,raceTime+flight),disc=p.vy*p.vy+44*(p.y-future.y);flight=clamp((p.vy+Math.sqrt(Math.max(0,disc)))/22,.05,1.2);}
  const future=movingForecast(target,raceTime+flight),spot=safePlatformPoint(future,p.x+p.vx*flight,p.z+p.vz*flight,.9);
  // A circular landing area needs braking toward its safe interior, not an
  // AABB corner, and must account for the platform's remaining travel.
  const dx=(spot.x-p.x)/Math.max(.2,flight)-p.vx*.45,dz=(spot.z-p.z)/Math.max(.2,flight)-p.vz*.45,d=Math.hypot(dx,dz);
  return {x:d>.1?dx/Math.max(7,d):0,z:d>.1?dz/Math.max(7,d):0,jump:false};
 }
 const input=divePlanner.steer(p,target);
 p.diveCheck=(p.diveCheck||0)-dt;
 const scheduled=p.aiDivePlan?.target===target?p.aiDivePlan:null;
 if(scheduled&&p.airTime<scheduled.diveAt)return input;
 if(p.diveCheck>0||p.diveUsed||p.pendingKnockdown||p.grabbedBy!==null||p.stagger>0||p.airTime<.14)return input;
 p.diveCheck=.1;
 if(target.type!=='platform'||p.vy<-5)return input;
 const seed={...p,actor:p,speed:expert||p.i===localId()?7:6.4};
 // An ordinary safe jump always wins over an optional dive.
 const normal=divePlanner.predict(seed,target);
 if(!scheduled&&normal&&divePlanner.clear(normal,p.launchSurface))return input;
 // Once a validated dive is due, commit if the current landing is safe instead
 // of repeatedly postponing it for a slightly better predicted landing margin.
 const choice=divePlanner.choose(seed,target,[0],p.launchSurface,true)??divePlanner.choose(seed,target,[.08,.16],p.launchSurface,true);
 if(choice){
   if(choice.delay===0){p.shiftAction=true;return {x:0,z:0,jump:false};}
   p.aiDivePlan={target,diveAt:p.airTime+choice.delay};
 }
 return input;
}
function aiLongJump(p,target,link){
 const speed=expert||p.i===localId()?7:6.4;
 if(p.aiRunup){
   const dx=p.aiRunup.x-p.x,dz=p.aiRunup.z-p.z,len=Math.hypot(dx,dz);
   if(len>.3)return {x:dx/len,z:dz/len,jump:false};
   p.aiRunup=null;
 }
 const dx=link.takeoff.x-p.x,dz=link.takeoff.z-p.z,distance=Math.hypot(dx,dz);
 const fx=Math.cos(link.yaw),fz=Math.sin(link.yaw);
 const passed=(p.x-link.takeoff.x)*fx+(p.z-link.takeoff.z)*fz>=0;
 if(distance>.28&&!passed)return {x:dx/distance,z:dz/distance,jump:false};
 const input=divePlanner.steer(p,target);
 if(p.jumpCD<=0&&!p.pendingKnockdown&&p.grabbedBy===null&&p.stagger<=0){
   const choice=divePlanner.choose(divePlanner.launch(p,target,speed),target,[.16,.24,.32,.4,.48],p.ground,true);
   if(choice){p.aiDivePlan={target,diveAt:choice.delay};p.diveCheck=0;return {...input,jump:true};}
 }
 // Insufficient runway, bad alignment, traffic or a new obstacle: back away
 // before the edge, regain speed, and validate again rather than lunging blindly.
 const origin=link.origin;
 p.aiRunup={x:origin.x-fx*Math.min(1.2,origin.designWidth/4),z:origin.z-fz*Math.min(1.2,origin.designDepth/4)};
 const rx=p.aiRunup.x-p.x,rz=p.aiRunup.z-p.z,len=Math.hypot(rx,rz)||1;
 return {x:rx/len,z:rz/len,jump:false};
}
function aiGrabEscapeInput(p){
 if(isDown(p))return {x:0,z:0,jump:false};
 const holder=players.find(q=>q.i===p.grabbedBy);
 if(!holder)return {x:0,z:0,jump:false};
 const away=Math.atan2(p.z-holder.z,p.x-holder.x);
 let heading=away;
 // Prefer pulling away, but sidestep or turn inward when that leads off a ledge.
 if(p.ground){
   for(const offset of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI]){
     const angle=away+offset,fx=Math.cos(angle),fz=Math.sin(angle);
     const safe=[-.36,0,.36].every(side=>{
       const support=supportAt(p.ground,p.x+fx*.65-fz*side,p.z+fz*.65+fx*side);
       return support&&support.normal.y>=.5&&Math.abs(support.height-p.y)<.4;
     });
     if(safe){heading=angle;break;}
   }
 }
 // Normal escape is continuous movement for 0.5 s. Only a wave about to reach
 // the feet justifies a jump, after at least 0.2 s of trying to move free.
 const waveThreat=p.ground&&!isDiving(p)&&p.jumpCD<=0&&p.escapeProgress>=.4&&waves.some(w=>{
   const gap=Math.hypot(p.x-w.x,p.z-w.z)-w.r;
   return !w.hitPlayers?.has(p.i)&&Math.abs(w.y-(p.y+.35))<.5&&gap>.15&&gap<1.25;
 });
 return {x:Math.cos(heading),z:Math.sin(heading),jump:!!waveThreat};
}
function bot(p,dt){
 if(isDown(p))return {x:0,z:0,jump:false};
 if(p.grabbedBy!==null)return aiGrabEscapeInput(p);
 if(isDiving(p))return {x:0,z:0,jump:false};
 if(p.giveUp){const edge=p.ground?p.ground.x+ext(p.ground).x-p.x:0;return {x:1,z:0,jump:!!p.ground&&edge<.8&&p.jumpCD<=0};}
 if(p.ground===goalSurface())return {x:clamp((MAP.goalX+3-p.x)*2,-1,1),z:clamp(-p.z*2,-1,1),jump:false};
 if(!p.ground){
   if(p.launchSurface?.type==='bounce'&&!p.plan.length){p.noRoute=(p.noRoute||0)+dt;if(p.noRoute>2){p.giveUp=true;return {x:1,z:0,jump:false};}}
   return p.plan[0]?aiAirInput(p,p.plan[0],dt):{x:0,z:0,jump:false};
 }
 p.think-=dt;
 if(p.think<=0||!p.plan.length){p.plan=route(p.ground,p);p.think=.6;}
 const reached=p.plan.indexOf(p.ground);if(reached>=0)p.plan.splice(0,reached+1);
 let target=p.plan[0];
 if(!target){
   p.noRoute=(p.noRoute||0)+dt;
   if(p.noRoute>2){p.giveUp=true;$('aiNote').textContent=p.name+' 找不到通往終點的可行路線，決定跳下雲海。';return {x:1,z:0,jump:false};}
   return {x:0,z:0,jump:false};
 }
 p.noRoute=0;
 const movingTransfer=isMoving(p.ground)||isMoving(target);
 if(movingTransfer){
  const future=movingForecast(target,raceTime+.65);
  if(!canJump(p.ground,future)||!canJump(p.ground,target)){p.aiHopRunup=null;return waitForPlatform(p,target);}
 }
 if(p.aiHopRunup){
  const r=p.aiHopRunup;if(r.ground!==p.ground||r.target!==target)p.aiHopRunup=null;
  else{const dx=r.x-p.x,dz=r.z-p.z,d=Math.hypot(dx,dz);if(d>.22)return {x:dx/d,z:dz/d,jump:false};p.aiHopRunup=null;}
 }
 if(!canJump(p.ground,target)){
   const link=divePlanner.link(p.ground,target,expert||p.i===localId()?7:6.4);
   if(link)return aiLongJump(p,target,link);
 }
 const te=ext(target),ce=ext(p.ground),landing=movingForecast(target,raceTime+.65),spot=safePlatformPoint(landing,p.x,p.z);
 let tx=spot.x,tz=spot.z;
 let dx=tx-p.x,dz=tz-p.z,len=Math.hypot(dx,dz);
 if(len<.2){dx=target.x-p.x;dz=target.z-p.z;len=Math.hypot(dx,dz);}
 const along=((p.x-p.ground.x)*dx+(p.z-p.ground.z)*dz)/(len||1),radiusSq=(p.x-p.ground.x)**2+(p.z-p.ground.z)**2;
 const edge=isMoving(p.ground)?Math.max(0,-along+Math.sqrt(Math.max(0,along*along+MOVING.radius**2-radiusSq))):Math.min(Math.abs(dx)>.1?(ce.x-Math.sign(dx)*(p.x-p.ground.x))/Math.max(.01,Math.abs(dx)/(len||1)):99,
   Math.abs(dz)>.1?(ce.z-Math.sign(dz)*(p.z-p.ground.z))/Math.max(.01,Math.abs(dz)/(len||1)):99);
 const nearHazard=surfaces.some(s=>['field','cannon'].includes(s.type)&&Math.hypot(s.x-p.x,s.z-p.z)<4);
 const input={x:dx/(len||1),z:dz/(len||1),jump:p.jumpCD<=0&&(edge<.85||(walkY(target)>p.y+.35&&len<1.2)||(expert&&nearHazard))};
 if(input.jump&&gap(p.ground,target)>1.1){
  const forward=p.vx*input.x+p.vz*input.z,side=p.vz*input.x-p.vx*input.z;
  if(forward<4.8||Math.abs(side)>1.4){
   p.aiHopRunup={ground:p.ground,target,x:p.ground.x-input.x*Math.min(.9,ce.x*.35),z:p.ground.z-input.z*Math.min(.9,ce.z*.35)};
   const rx=p.aiHopRunup.x-p.x,rz=p.aiHopRunup.z-p.z,d=Math.hypot(rx,rz)||1;return {x:rx/d,z:rz/d,jump:false};
  }
 }

 return facilities?.avoid(p,input,raceTime)??input;
}
function die(p,why){
 if(predictionPass)return;
 if(!p.alive||p.finished)return;
 if(phase==='race'&&!practiceMode&&!net?.isGuest&&p.fallCreditTime>0){
  const attacker=players.find(q=>q.i===p.fallCredit&&q!==p);
  if(attacker){attacker.score++;attacker.roundKnockouts=(attacker.roundKnockouts||0)+1;
   if(attacker.i===localId()){$('status').textContent='把 '+p.name+' 擊落雲海，+1 分！';beep(950,.14);}
  }
 }
 p.fallCredit=null;p.fallCreditTime=0;releasePlayerGrabs(p);p.alive=false;p.mesh.visible=false;
 if(p.i===localId()){$('status').textContent=why+' · 觀戰中，下一回合再來！';beep(150,.3);}scores();
}
function releasePlayerGrabs(p){
 if(p.grabbing!==null)releaseGrab(p,players,'break');
 if(p.grabbedBy!==null)releaseGrab(players.find(q=>q.i===p.grabbedBy),players,'break');
}
function hitHazard(p,dx,dz,strength,lift,why){
 if(!hazardImpact(p,dx,dz,strength,lift))return false;
 if(p.grabbing!==null)releaseGrab(p,players,'break');
 if(p.i===localId()){$('status').textContent=why+'！正在翻滾，落地後才會起身。';beep(180,.12);}
 return true;
}
function hitWave(p){
 if(!waveImpact(p))return false;
 if(p.grabbing!==null)releaseGrab(p,players,'break');
 if(p.i===localId()){$('status').textContent='被力場波紋擊倒！落地後會自動起身。';beep(180,.12);}
 return true;
}
function hitMechanism(p,impulse,velocity,why){
 if(!mechanicalImpact(p,impulse,velocity))return false;
 if(isDown(p))releasePlayerGrabs(p);
 if(p.i===localId()){$('status').textContent=why+(isDown(p)?'，撞擊過強而倒地！':'，被擊退了！');beep(180,.12);}return true;
}
function hitSolidContacts(p){
 let best=null;
 for(const c of p.surfaceContacts||[]){
  if(Math.abs(c.normal.y)>=.5)continue; // Normal jumps keep their existing floor/ceiling response and high-fall rule.
  const f=c.surface.mesh.userData.facility;
  if(f?.pivot){let m=c.mesh;while(m&&m!==f.pivot)m=m.parent;if(m)continue;}
  const impulse=contactImpulse(c.normal,c.surface.motionVelocity??new T.Vector3(),c.velocity);
  if(impulse&&impulse.impactEnergy>COMBAT.knockdownEnergy&&(!best||impulse.impactEnergy>best.impulse.impactEnergy))best={impulse,velocity:c.velocity};
 }
 if(best)hitMechanism(p,best.impulse,best.velocity,'高速撞上物件');
}
function startDive(p){
 if(!p.alive||p.finished||isDown(p)||isDiving(p)||p.diveUsed||p.pendingKnockdown||p.grabbedBy!==null)return false;
 const fromGround=!!p.ground;
 if(p.grabbing!==null)releaseGrab(p,players,'break');
 p.grabIntent=false;p.grabVisualTarget=null;p.grabNeedsRelease=false;
 if(p.i===localId()&&!predictionPass)grabHeld=false;
 p.punchTime=-1;p.punchResolved=true;
 p.jumpActive=false;p.jumpGrace=0;p.jumpSupport=null;p.jumpBuffer=0;p.diving=true;p.diveUsed=true;p.diveYaw=p.facing;
 if(isBot(p)){p.aiDiveCount++;$('aiNote').textContent=p.name+' 確認落點後，使用跳躍接飛撲。';}
 launchDive(p);
 if(fromGround){p.launchSurface=p.ground;inheritPlatformMotion(p,p.ground);p.ground=null;p.jumpCD=Math.max(p.jumpCD,.2);}
 if(p.i===localId())beep(640,.06);
 return true;
}
function updateDive(p,dt){
 if(p.diving)p.divePose=Math.min(1,p.divePose+dt/DIVE.poseSeconds);
 else if(p.diveRecovery>0){
   if(!p.ground){p.diving=true;p.diveRecovery=0;return;}
   // Stay low under a ceiling; crawl clear before raising the capsule.
   const bottom=new T.Vector3(p.x,p.y+.362,p.z),top=new T.Vector3(p.x,p.y+1.092,p.z);
   if(!collisionWorld.capsule(bottom,top,.36).length){
     p.diveRecovery=Math.max(0,p.diveRecovery-dt);
     p.divePose=Math.min(p.divePose,p.diveRecovery/DIVE.recoverySeconds);
   }
 }
 if(p.ground&&!isDiving(p)){p.diveUsed=false;p.divePose=0;}
}
function recordGrabInput(p,input){
 if(isBot(p)&&input.jump&&!p.struggleJump)strugglePulse(p);
 p.struggleMoving=Math.hypot(input.x,input.z)>.1;p.struggleJump=!!input.jump;
}
function tryJump(p,input,support,rebound=false,mobility=1){
 if(!(input.jump||p.jumpBuffer>0)||!support||p.jumpCD>0||isDown(p)||isDiving(p)||p.pendingKnockdown||p.grabbedBy!==null)return false;
 if(p.ground)p.diveUsed=false;
 beginJump(p,rebound?input:null,mobility);p.launchSurface=support;inheritPlatformMotion(p,support);p.ground=null;p.jumpCD=.32;
 if(p.i===localId())beep(480,.06);
 return true;
}
function move(p,dt,input){
 p.jumpCD-=dt;
 p.jumpBuffer=Math.max(0,(p.jumpBuffer||0)-dt);
 p.jumpGrace=Math.max(0,(p.jumpGrace||0)-dt);
 if(p.ground&&!isDown(p)&&!isDiving(p)){p.jumpGrace=JUMP.edgeGraceSeconds;p.jumpSupport=p.ground.id;}
 const shiftAction=p.shiftAction;p.shiftAction=false;
 const pressedJump=!!input.jumpPressed||(input.jump&&!p.jumpWasDown);p.jumpWasDown=!!input.jump;
 if(pressedJump)p.jumpBuffer=JUMP.bufferSeconds;
 if(shiftAction)startDive(p);
 updateDive(p,dt);
 recordGrabInput(p,input);
 // A recovering character that loses support returns to physics immediately.
 if(p.getUpTime>0&&!p.ground&&!p.ragdoll?.active)knockDown(p);
 if(p.ragdoll?.active&&p.downTime<=0){
   // Don't stand through a low ceiling or teleport onto an overhead platform.
   let spot=null;
   const contact=p.ragdoll.support;
   const anchors=[{x:p.x,z:p.z,height:p.y+.4,surface:null}];
   // The pelvis may hang below the platform while the head/ear supports the
   // body. Search around that actual contact, without allowing a higher roof.
   if(contact)anchors.push({x:contact.point.x,z:contact.point.z,height:contact.point.y+.04,surface:contact.surface});
   if(p.ground&&p.recoverySupportTime>=.12)for(const anchor of anchors){
     for(const radius of [0,.45,.85]){
       for(let i=0;i<(radius?8:1);i++){
         const x=anchor.x+Math.cos(i*Math.PI/4)*radius,z=anchor.z+Math.sin(i*Math.PI/4)*radius;
         let floor=-Infinity;
         for(const surface of anchor.surface?[anchor.surface]:surfaces){const support=supportAt(surface,x,z);if(support?.normal.y>=.5&&support.height<=anchor.height&&support.height>floor)floor=support.height;}
         if(!Number.isFinite(floor))continue;
         const bottom=new T.Vector3(x,floor+.362,z),top=new T.Vector3(x,floor+1.092,z);
         if(!collisionWorld.capsule(bottom,top,.36).length){spot={x,y:floor+.002,z};break;}
       }
       if(spot)break;
     }
     if(spot)break;
   }
   if(spot){beginRecovery(p);Object.assign(p,spot);}
   else{p.downTime=.15;p.getUpTime=0;}
 }
 if(p.downTime>0){
   stepRagdoll(p,dt,collisionWorld,players);
 }else{
 let mobility=isDown(p)?0:p.diving?.2:p.diveRecovery>0?.25:p.grabbedBy!==null?COMBAT.grabbedMoveScale:p.grabbing!==null?(isDown(players.find(q=>q.i===p.grabbing))?.55:COMBAT.grabMoveScale):p.pendingKnockdown?.35:p.stagger>0?.45:1;
 // A taut grip slows walking away from the target, including against walls.
 // Collision still resolves both bodies; stretching the tether never releases it.
 if(p.grabbing!==null){
   const target=players.find(q=>q.i===p.grabbing);
   if(target){
     const dx=p.x-target.x,dz=p.z-target.z,d=Math.hypot(dx,dz);
     if(input.x*dx+input.z*dz>0)mobility*=clamp((2.3-d)/.9,0,1);
   }
 }
 const speed=(expert||!isBot(p)?7:6.4)*mobility;
 if(p.ground){
   const response=p.ground.frozen?ICE.groundResponse:MOTION.groundResponse;
   p.vx=T.MathUtils.damp(p.vx,input.x*speed,response,dt);
   p.vz=T.MathUtils.damp(p.vz,input.z*speed,response,dt);
 }else if(mobility>0&&Math.hypot(input.x,input.z)>.01){
   // Air input nudges velocity instead of replacing the takeoff momentum.
   // Releasing direction coasts; turning the body never rotates this velocity.
   const dx=input.x*speed-p.vx,dz=input.z*speed-p.vz,length=Math.hypot(dx,dz);
   const fraction=Math.min(1,MOTION.airAcceleration*mobility*dt/(length||1));
   p.vx+=dx*fraction;p.vz+=dz*fraction;
 }
 const jumpGround=p.ground??(p.jumpGrace>0&&p.jumpSupport!=null?surfaces[p.jumpSupport]:null);
 const jumped=tryJump(p,input,jumpGround);
 updateJump(p,dt,input.jumpHeld??true);
 const from=new T.Vector3(p.x,p.y,p.z),wasGrounded=!!p.ground;
 p.vy-=22*dt;p.x+=(p.vx+p.grabVelocityX)*dt;p.z+=(p.vz+p.grabVelocityZ)*dt;integrateImpulse(p,dt);p.y+=p.vy*dt;
 const fallSpeed=-p.vy;
 p.ground=collisionWorld.movePlayer(p,from,new T.Vector3(p.x,p.y,p.z));
 if(p.jumpSupportContact!=null&&!isDown(p)&&!isDiving(p)&&!p.jumpActive){p.jumpGrace=JUMP.edgeGraceSeconds;p.jumpSupport=p.jumpSupportContact;}
 if(p.ground){
   const surface=p.ground;p.landingSpeed=wasGrounded?0:fallSpeed;
   p.aiDivePlan=null;
   if(p.diving){p.diving=false;p.diveRecovery=DIVE.recoverySeconds;}
   if(!predictionPass&&(p.pendingKnockdown||p.landingSpeed>16)&&!isDown(p)){
     knockDown(p);
     beginRagdoll(p);
     if(p.grabbing!==null)releaseGrab(p,players,'break');
     if(p.i===localId())$('status').textContent='倒地了，稍等一下就會起身。';
   }
   if(surface.type==='bounce'&&p.jumpCD<=0&&!isDown(p)){
     // Landing is consumed before the trampoline clears ground. Air steering now aims at the NEXT surface.
     if(isBot(p)){p.plan=route(surface,p);p.think=.6;if(p.plan.length)p.noRoute=0;}
     // This is a completed landing followed by a new launch, not an interrupted
     // dive recovery. Restore the upright body and permit one dive in this flight.
     p.diving=false;p.diveRecovery=0;p.divePose=0;p.diveUsed=false;
     p.jumpActive=false;p.jumpGrace=0;p.jumpSupport=null;p.jumpBuffer=0;p.airTime=0;p.launchSurface=surface;p.vy=14;p.jumpCD=.5;p.ground=null;
   }
   if(surface.type!=='bounce'){
     // A real landing ends the old flight's lockout. Held or buffered input
     // starts the next jump in this collision step, without a grounded wait.
     p.jumpCD=0;
     // Reset the previous flight velocity to the current input direction on
     // a true landing rebound, before inheriting the new support's motion.
     if(!jumped&&p.landingSpeed<=16&&tryJump(p,input,surface,!wasGrounded,mobility))updateJump(p,0,input.jumpHeld??true);
   }
 }
 }
 p.airTime=p.ground?0:(p.airTime||0)+dt;
 if(!predictionPass&&(p.y<-9||Math.abs(p.z)>MAP.halfWidth+10)){die(p,'掉進雲海了');return;}
 if(!predictionPass){
 hitSolidContacts(p);
 for(const surface of surfaces){
   const l=local(surface,p),fx=Math.cos(surface.angle),fz=-Math.sin(surface.angle);
   if(surface.type==='spike'&&Math.abs(l.x)<1.5&&Math.abs(l.z)<1.5&&p.y<surface.y+1.1&&p.y+1.4>surface.y+.15)
     hitHazard(p,p.x-surface.x,p.z-surface.z,8,5.8,'被尖刺彈飛');
   if(surface.type==='fan'&&l.x>.5&&l.x<8&&Math.abs(l.z)<1.7&&p.y<surface.y+3&&p.y>surface.y-.6){
     const f=(1-l.x/10)*16;p.impulseX+=fx*f*dt;p.impulseZ+=fz*f*dt;
   }
 }
 for(const wave of waves){
   wave.hitPlayers??=new Set();
   const r=Math.hypot(p.x-wave.x,p.z-wave.z);
   if(!wave.hitPlayers.has(p.i)&&Math.abs(r-wave.r)<.32&&p.y<wave.y+.5&&p.y+1.4>wave.y-.1){
     hitWave(p);wave.hitPlayers.add(p.i);
   }
 }
 if(!practiceMode||practiceRoom)facilities?.hit(p,hitHazard,hitMechanism);
 if(!practiceRoom&&p.alive&&!isDown(p)&&p.x>MAP.goalX+1&&Math.abs(p.z)<4&&p.y>MAP.goalY-.2&&p.y<MAP.goalY+3){
   releasePlayerGrabs(p);p.finished=true;finishOrder.push(p.i);p.mesh.visible=false;
   if(p.i===localId()){$('status').textContent='抵達終點！漂亮，等待其他玩家。';beep(1200,.25);}scores();
 }
 }
 p.mesh.position.set(p.x,p.y,p.z);
 const heldTarget=players.find(q=>q.i===p.grabbing);
 p.grabFacingLocked=!!heldTarget&&!isDown(heldTarget);
 if(p.grabFacingLocked)p.facing=p.grabYaw;
 else if(!isDown(p)&&!isDiving(p)&&Math.hypot(input.x,input.z)>.1){
   const target=Math.atan2(input.z,input.x);
   const delta=Math.atan2(Math.sin(target-p.facing),Math.cos(target-p.facing));
   const step=clamp(delta*(1-Math.exp(-MOTION.turnResponse*dt)),-MOTION.maxTurnSpeed*dt,MOTION.maxTurnSpeed*dt);
   p.facing=Math.atan2(Math.sin(p.facing+step),Math.cos(p.facing+step));
 }
 if(heldTarget&&!p.grabFacingLocked)p.grabYaw=p.facing;
 p.mesh.rotation.y=-p.facing;
}
function advanceCannonShot(b,dt){
 b.age+=dt;if(b.spent)return;
 const steps=Math.max(1,Math.ceil(Math.hypot(b.dx,b.dz)*dt/.15)),h=dt/steps;
 for(let i=0;i<steps;i++){
  b.mesh.position.x+=b.dx*h;b.mesh.position.z+=b.dz*h;
  if(collisionWorld.sphere(b.mesh.position,CANNON.radius,b.source).length){b.spent=true;return;}
  for(const p of players){
   if(!p.alive||p.finished)continue;
   const y=clamp(b.mesh.position.y,p.y+.36,p.y+(p.diving?.8:1.1));
   if(b.mesh.position.distanceToSquared(new T.Vector3(p.x,y,p.z))<(CANNON.radius+.36)**2){
    hitHazard(p,b.dx,b.dz,CANNON.knockback,CANNON.lift,'被高速砲彈擊飛');b.spent=true;return;
   }
  }
 }
}
function traps(dt){movers?.pose(raceTime,true);if(!practiceMode||practiceRoom)facilities?.step(dt,raceTime);for(let s of surfaces){if(s.type==='rotate'){s.mesh.rotation.x=Math.sin((raceTime+s.offset)*.85)*1.45;updateSolidBounds(s);}if(s.type==='fan')s.mesh.userData.blades.rotation.x+=dt*16;if(s.type==='cannon'&&raceTime-s.lastShot>2.5){s.lastShot=raceTime;let m=sphere(CANNON.radius,0x303f41,world);m.position.set(s.x+Math.cos(s.angle)*1.55,s.y+.9,s.z-Math.sin(s.angle)*1.55);shots.push({id:++effectSerial,mesh:m,source:s,dx:Math.cos(s.angle)*CANNON.speed,dz:-Math.sin(s.angle)*CANNON.speed,age:0});}if(s.type==='field'&&raceTime-s.lastWave>4.2){s.lastWave=raceTime;let mesh=createWaveMesh();setWaveRadius(mesh,.2);mesh.position.set(s.x,s.y+.35,s.z);world.add(mesh);waves.push({id:++effectSerial,mesh,x:s.x,z:s.z,y:s.y+.35,r:.2});}}
 shots=shots.filter(b=>{advanceCannonShot(b,dt);if(b.age>6||b.spent){world.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();return false;}return true;});waves=waves.filter(w=>{w.r+=dt*WAVE.speed;setWaveRadius(w.mesh,w.r);if(w.r>WAVE.radius){world.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();return false;}return true;});}
function endRound(){if(phase==='results')return;grabHeld=false;clearGrabs(players);players.forEach(p=>{const finishPoints=p.finished?(finishOrder.length===players.length?1:3+(finishOrder[0]===p.i?1:0)):0;p.delta=finishPoints+(p.roundKnockouts||0);p.score+=finishPoints;});setPhase('results',0,'回合結算','好路線還是壞心眼？下回合繼續加料。');show('results',true);let ranked=[...players].sort((a,b)=>b.score-a.score);$('resultEyebrow').textContent=round===8?'PARTY COMPLETE':'ROUND COMPLETE';$('resultTitle').textContent=round===8?ranked[0].name+' 贏得這場派對！':finishOrder.length?'有人成功突破工地！':'這輪機關太刁鑽，再挑戰一次！';$('resultNote').textContent=finishOrder.length+' / '+players.length+' 人抵達。'+(round===8?'這局已結束，可以再開一場。':'已放物件會保留。下一回合繼續搭路與設陷阱。');$('resultRows').innerHTML=ranked.map((p,i)=>`<div class="resultrow"><span>${String(i+1).padStart(2,'0')}</span><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${html(p.name)}<small>${p.finished?'抵達':'未抵達'}${p.roundKnockouts?' · 擊落 '+p.roundKnockouts:''}</small><b>${p.score} <small>+${p.delta}</small></b></div>`).join('');$('next').textContent=round===8?'再開一場 ↗':'下一回合 →';scores();}
function toLobby(){practiceMode=false;practiceRoom=false;phase='lobby';unlockMouse();for(let id of ['hud','draft','buildTools','results'])show(id,false);show('lobby',true);show('previewNote',true);clean();makeMap();resetPlayers(8);players.forEach((p,i)=>{p.x=(i%4)*1.2-2;p.z=Math.floor(i/4)*2-1;p.mesh.position.set(p.x,0,p.z);});}
const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3();

const punchRay=new T.Raycaster();
function punchBlocked(a,b){
 const origin=new T.Vector3(a.x,a.y+(isDown(a)?.3:.85),a.z), direction=new T.Vector3(b.x,b.y+(isDown(b)?.3:.85),b.z).sub(origin), distance=direction.length();
 punchRay.set(origin,direction.normalize());punchRay.far=distance;
 return surfaces.some(s=>punchRay.intersectObjects(s.mesh.userData.solids,false).length>0);
}
function punchHit(attacker,victim){
 const m=label('POW!', '#f28a45');m.scale.set(1.6,.4,1);m.position.set(victim.x,victim.y+1.7,victim.z);world.add(m);impacts.push({mesh:m,age:0});
 if(attacker.i===localId()){$('status').textContent='命中 '+victim.name+'！';beep(220,.07);}
 else if(victim.i===localId()){$('status').textContent='被 '+attacker.name+' 打退了，繼續移動！';beep(140,.08);}
}
function aiPunch(p){
 if(practiceMode&&grabPractice)return;
 if(p.grabbing!==null)return;
 if(p.grabNeedsRelease&&p.grabCooldown<=0)p.grabNeedsRelease=false;
 if(isDown(p)||isDiving(p)||p.aiDivePlan||p.demoTarget||p.grabbedBy!==null||p.grabbing!==null||p.punchCooldown>0||p.stagger>0||p.giveUp||raceTime<1.2)return;
 const target=players.find(q=>q!==p&&q.alive&&!q.finished&&Math.abs(q.y-p.y)<.8&&Math.hypot(q.x-p.x,q.z-p.z)<1.5&&(Math.cos(Math.atan2(q.z-p.z,q.x-p.x)-p.facing)>.5||(p.aggroTime>0&&p.lastAttacker===q.i)));
 if(target&&p.i%3===1&&(isDown(target)||(Math.floor(raceTime/4)+p.i)%3===0)){
   if(tryGrab(p))return;
 }
 if(target)startPunch(p);
}
function practiceInput(p,dt=1/60){
 if(p.demoTarget){
   if(p.ground===p.demoTarget&&!isDiving(p)){$('status').textContent=p.name+' 已安全落地，並在平台內煞停。';return {x:0,z:0,jump:false};}
   $('status').textContent=p.diving?p.name+' 已確認落點，正在飛撲！':p.ground?p.name+' 正在助跑，準備跨越 6 公尺缺口。':p.name+' 已起跳，正在評估飛撲時機。';
   return bot(p,dt);
 }
 if(isDown(p))return {x:0,z:0,jump:false};
 if(p.grabbing!==null)return {x:Math.cos(p.grabRetreatYaw)*.25,z:Math.sin(p.grabRetreatYaw)*.25,jump:false};
 if(p.grabbedBy!==null)return aiGrabEscapeInput(p);
 if(grabPractice)return {x:0,z:0,jump:false};
 const target=players.find(q=>q.i===p.lastAttacker&&q.alive&&!q.finished);
 if(p.aggroTime<=0||!target)return {x:0,z:0,jump:false};
 const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
 return {x:d>1.15?dx/d*.55:0,z:d>1.15?dz/d*.55:0,jump:false};
}
function showGrabPractice(){
 $('help').close?.();practice();grabPractice=true;
 players.forEach((p,i)=>{
   p.x=i===0?-2:i===1?-.8:4;p.z=i<2?0:-5+(i-2)*1.5;
   p.facing=i===0?0:Math.PI;p.mesh.rotation.y=-p.facing;p.mesh.position.set(p.x,p.y,p.z);
 });
 $('phaseLabel').textContent='抓取手感練習';
 $('status').textContent='按住右鍵抓住前方 Mochi；WASD 推拉。對方會移動 0.5 秒掙脫。';
 $('aiNote').textContent='抓取練習暫停 AI 出拳，可用倒地拖拉練習比較布娃娃手感。';
}

function startPracticeRoom(){
 if(net?.online)net.leave();
 const seed=mapSeed??((Math.random()*4294967296)>>>0);
 clean();practiceMode=true;practiceRoom=true;makeMap(seed);resetPlayers(1);
 round=0;raceTime=0;startingRace=false;yaw=0;pitch=PLAY_CAMERA.pitch;
 for(const id of ['lobby','previewNote','roomPanel','results'])show(id,false);
 show('hud',true);resumePracticeRoom();
}
function resumePracticeRoom(message='按 P 開啟物件選單，自由搭建與試玩。'){
 if(!practiceRoom)return;
 clearGhost();unlockMouse();selection=[];placed=false;placementPending=false;
 localPlayer().pick=null;localPlayer().built=false;
 show('draft',false);show('buildTools',false);
 setPhase('race',0,'自由練習室','1 人練習 · 全物件無限取用 · 沒有時間限制');
 $('controls').textContent='WASD 移動 · Space 短／長跳 · Shift 飛撲 · P 物件選單';
 $('aiNote').textContent='掉落會自動回到起點；放置的物件會保留到離開練習室。';
 $('status').textContent=message;
}
function openPracticePicker(){
 if(!practiceRoom||!['race','build','draft'].includes(phase))return;
 clearGhost();localPlayer().pick=null;localPlayer().built=false;placed=false;
 selection=TYPES.map(([type])=>({type,owner:null}));
 show('buildTools',false);setPhase('draft',0,'選擇練習物件','全物件可重複取用，選擇與放置都不限時。');
 show('draft',true);renderDraft();
 $('controls').textContent='點擊物件開始放置 · P 返回練習';
 $('aiNote').textContent='選單開啟時場景暫停，放置後從原本的位置繼續試玩。';
}
function togglePracticePicker(){
 if(!practiceRoom)return;
 if(phase==='draft')resumePracticeRoom();else openPracticePicker();
}
function choosePracticeObject(index){
 if(!practiceRoom||phase!=='draft'||!selection[index])return;
 const p=localPlayer();p.pick=selection[index].type;p.built=false;
 beginBuild();
 setPhase('build',0,'自由放置','不限時間 · 綠色可放置 · P 換物件 · 取消可返回試玩');
 const size=p.pick==='ice'?null:isMoving(p.pick)?movingBounds(p.pick):shapeBounds(p.pick);
 const nearby={x:clamp(p.x+Math.cos(p.facing)*5,7,MAP.buildMaxX),y:clamp(p.y-(size?.min.y??0)+.04,-.5,MAP.maxBuildY),z:clamp(p.z+Math.sin(p.facing)*5,-MAP.halfWidth,MAP.halfWidth)};
 if(legal(nearby))aim=nearby;
 buildView.yaw=yaw;buildView.pitch=-.5;updateGhost();
 $('controls').textContent='WASD 移動 · Space ↑ Ctrl ↓ · R 旋轉 · Enter 放置 · P 換物件';
 $('aiNote').textContent=p.pick==='ice'?'白框為將凍結的物件；確認後立即變成低摩擦冰面。':'放置後即可繼續試玩；需要更多物件時再按 P。';
}
function practice(){
 if(net?.online)net.leave();
 start();practiceMode=true;show('draft',false);show('buildTools',false);
 setPhase('race',999,'拳擊練習場','Shift 單擊飛撲 · 左鍵出拳 · 右鍵抓人');
 spawn();yaw=0;pitch=PLAY_CAMERA.pitch;raceTime=0;
 players.forEach((p,i)=>{p.x=i===0?-1:1.1+Math.floor((i-1)/3)*2;p.z=i===0?0:((i-1)%3-1)*2;p.facing=i?Math.atan2(-p.z,-1-p.x):0;p.mesh.rotation.y=-p.facing;p.mesh.position.set(p.x,p.y,p.z);});
 $('controls').textContent='滑鼠轉視角 · WASD 移動 · Space 短／長跳・掙脫 · Shift 飛撲 · 左鍵拳 · 右鍵抓';
 $('aiNote').textContent='練習場：AI 會還手、抓人與掙脫。右下方可體驗擊飛、倒地與自動起身。';
}
function testImpact(){
 if(practiceMode&&phase==='race'&&localPlayer().alive)hitHazard(localPlayer(),1,0,6,6,'被測試衝擊擊飛');
}
function showAIDiveDemo(){
 $('help').close?.();practice();
 // Keep the six-metre jump demonstration separate from the floating-island layout.
 const count=players.length;clean();
 addSurface('platform',0,0,0,0,14,18,true);
 addSurface('platform',108,0,12,0,10,20,true);
 addSurface('platform',216,0,24,0,18,24,true);
 resetPlayers(count);spawn();
 const target=addSurface('platform',17,0,0,0,8,12,true);
 players.forEach((p,i)=>{
   p.x=i===0?4:i===1?2:-3-Math.floor(i/3);p.z=i===0?3.5:i===1?0:(i%3-1)*3;
   p.facing=0;p.mesh.rotation.y=0;p.mesh.position.set(p.x,p.y,p.z);
 });
 players[1].demoTarget=target;players[1].plan=[target];players[1].think=0;
 yaw=-.15;pitch=PLAY_CAMERA.pitch;
 $('phaseLabel').textContent='AI 跳撲示範';
 $('phaseHint').textContent='6 公尺缺口 · 助跑 → 起跳 → 判斷落點 → 飛撲煞停';
}
function testRagdoll(){
 if(!practiceMode||practiceRoom||phase!=='race'||isDown(localPlayer()))return;
 const h=localPlayer(),p=players[1];
 releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);
 const x=h.x+Math.cos(h.facing)*1.15,z=h.z+Math.sin(h.facing)*1.15;
 const support=surfaces.find(s=>Number.isFinite(floorAt(s,x,z))&&Math.abs(floorAt(s,x,z)-h.y)<.3);
 if(!support){$('status').textContent='先移動到平台中央，再開始拖拉練習。';return;}
 Object.assign(p,{x,z,y:floorAt(support,x,z),vx:0,vz:0,vy:0,alive:true,finished:false,ground:support,facing:h.facing+Math.PI});
 p.mesh.visible=true;p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=-p.facing;
 p.lastImpactX=Math.sin(h.facing);p.lastImpactZ=-Math.cos(h.facing);
 knockDown(p);p.downTime=6;scores();
 $('status').textContent='對手會倒地 6 秒；按住右鍵，移動並觀察四肢拖動。';
}
let orbitDrag=null,mouseLockPending=false,mouseLockWanted=false,mouseLockFallback=false;
function canLockMouse(){return (phase==='race'||phase==='build')&&!$('help').open&&!document.hidden;}
function mouseLocked(){return document.pointerLockElement===renderer.domElement;}
function syncMouseLock(){
 const button=$('mouseLock'),locked=mouseLocked();
 button.hidden=!canLockMouse();button.disabled=locked||mouseLockPending;
 button.textContent=locked?'滑鼠已鎖定 · Esc 解除':mouseLockPending?'正在鎖定滑鼠…':mouseLockFallback?'無法鎖定 · 點此重試':'點擊鎖定滑鼠';
 button.title=mouseLockFallback?'瀏覽器未允許滑鼠鎖定，目前仍可自由移動滑鼠轉視角。':'點擊遊戲畫面鎖定滑鼠；Esc 解除後可操作選單。';
}
function clearMouseInput(){
 keys={};if(localPlayer()){localPlayer().shiftAction=false;localPlayer().jumpRequested=false;localPlayer().jumpBuffer=0;}orbitDrag=null;stopGrabInput();
}
function unlockMouse(){
 mouseLockWanted=false;mouseLockPending=false;clearMouseInput();
 if(mouseLocked())document.exitPointerLock?.();
 syncMouseLock();
}
function mouseLockFailed(error){
 if(mouseLocked())return;
 if(error?.message)console.info('Pointer lock unavailable:',error.name,error.message);
 if(mouseLockWanted&&canLockMouse())mouseLockFallback=true;
 mouseLockWanted=false;mouseLockPending=false;syncMouseLock();
}
function requestMouseLock(){
 if(!canLockMouse()||mouseLocked()||mouseLockPending)return;
 mouseLockWanted=true;mouseLockPending=true;mouseLockFallback=false;orbitDrag=null;syncMouseLock();
 try{
   if(!renderer.domElement.requestPointerLock){mouseLockFailed();return;}
   // Keep the request inside the click gesture; older browsers return void.
   window.focus?.();
   renderer.domElement.tabIndex=-1;renderer.domElement.focus?.({preventScroll:true});
   const request=renderer.domElement.requestPointerLock();
   request?.catch(mouseLockFailed);
 }catch(error){mouseLockFailed(error);}
}
document.addEventListener('pointerlockchange',()=>{
 if(mouseLocked()){
   if(!mouseLockWanted||!canLockMouse()){unlockMouse();return;}
   mouseLockPending=false;mouseLockFallback=false;orbitDrag=null;
 }else{mouseLockWanted=false;mouseLockPending=false;clearMouseInput();}
 syncMouseLock();
});
document.addEventListener('pointerlockerror',mouseLockFailed);
$('mouseLock').onclick=requestMouseLock;
function tryGrab(p){
 const caught=startGrab(p,players,p.facing,punchBlocked);
 if(caught){
   if(p.i===localId()){$('status').textContent='抓住 '+players.find(q=>q.i===p.grabbing).name+'！按住右鍵推拉，鬆開即放手。';beep(720,.055);}
   else if(p.grabbing===0){$('status').textContent='被 '+p.name+' 抓住！持續移動或按 Space 掙脫。';beep(330,.055);}
 }
 return caught;
}
function stopGrabInput(){
 grabHeld=false;
 if(net?.isGuest)return;
 if(localPlayer()){releaseGrab(localPlayer(),players);localPlayer().grabNeedsRelease=false;localPlayer().grabIntent=false;}
}
renderer.domElement.addEventListener('pointerdown',e=>{
 if(!canLockMouse())return;
 if(!mouseLocked()&&!mouseLockFallback&&renderer.domElement.requestPointerLock){e.preventDefault?.();requestMouseLock();return;}
 if(phase!=='race')return;
 if(net?.isGuest){if(e.button===2){e.preventDefault?.();grabHeld=true;}else if(e.button===0)net.action('punch');return;}
 if(e.button===2){e.preventDefault?.();if(isDiving(localPlayer()))return;grabHeld=true;localPlayer().grabIntent=!localPlayer().grabNeedsRelease;tryGrab(localPlayer());return;}
 if(e.button===0&&startPunch(localPlayer()))beep(360,.04);
});
window.addEventListener('pointerup',e=>{if(e.button===2)stopGrabInput();});
window.addEventListener('pointercancel',stopGrabInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)unlockMouse();else syncMouseLock();});

renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('pointerenter',e=>{orbitDrag={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointermove',e=>{
 if(!canLockMouse()){orbitDrag=null;return;}
 if(document.pointerLockElement===renderer.domElement)return;
 const dx=orbitDrag?e.clientX-orbitDrag.x:(e.movementX||0),dy=orbitDrag?e.clientY-orbitDrag.y:(e.movementY||0);
 orbitDrag={x:e.clientX,y:e.clientY};
 rotateView(clamp(dx,-150,150),clamp(dy,-150,150));
});
renderer.domElement.addEventListener('pointerleave',()=>orbitDrag=null);
document.addEventListener('mousemove',e=>{
 if(canLockMouse()&&mouseLocked())rotateView(e.movementX||0,e.movementY||0,.0023);
});

window.addEventListener('keydown',e=>{if(e.code==='Escape'){if(practiceRoom&&phase==='draft')resumePracticeRoom();else unlockMouse();return;}if($('help').open)return;if(e.code==='KeyP'&&practiceRoom){e.preventDefault();if(!e.repeat)togglePracticePicker();return;}if(['Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();const wasShift=keys.ShiftLeft||keys.ShiftRight;keys[e.code]=true;if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat&&!wasShift&&phase==='race'){if(net?.isGuest)net.action('dive');else localPlayer().shiftAction=true;}if(e.code==='Space'&&!e.repeat&&phase==='race'){if(net?.isGuest)net.action('jump');else{localPlayer().jumpRequested=true;strugglePulse(localPlayer());}}if(e.code==='KeyN'&&!e.repeat)skipAIRound();if(e.code==='Enter'&&phase==='build')placeHuman();if(e.code==='KeyR'&&!e.repeat&&phase==='build'&&!placed){rotatePlacement();}});window.addEventListener('keyup',e=>keys[e.code]=false);window.addEventListener('blur',unlockMouse);
$('grabPracticeDemo').onclick=showGrabPractice;$('aiDiveDemo').onclick=showAIDiveDemo;$('testRagdoll').onclick=testRagdoll;$('testImpact').onclick=testImpact;$('practice').onclick=practice;$('practiceRoom').onclick=startPracticeRoom;$('practiceObjects').onclick=openPracticePicker;$('closePracticePicker').onclick=()=>resumePracticeRoom();$('cancelPracticePlacement').onclick=()=>resumePracticeRoom('已取消放置。按 P 可選擇其他物件。');$('rerollMap').onclick=()=>{if(phase!=='lobby')return;toLobby();};
$('skipAI').onclick=skipAIRound;$('start').onclick=start;$('quit').onclick=()=>net?.online?net.leave():toLobby();$('next').onclick=()=>{if(net?.online){if(!net.isHost)return;if(round===8){net.send({type:'lobby'});return;}}round===8?start():beginRound();};$('rotate').onclick=()=>{if(!placed){placementYaw+=Math.PI/2;updateGhost();}};$('ready').onclick=placeHuman;$('autoPlace').onclick=()=>{if(!placed){aim=suggest(localPlayer().pick);$('height').value=''+aim.y;updateGhost();}};$('helpBtn').onclick=()=>{$('help').showModal();unlockMouse();};$('closeHelp').onclick=()=>{$('help').close();syncMouseLock();};$('help').addEventListener('close',syncMouseLock);$('soundBtn').onclick=()=>{muted=!muted;$('soundBtn').textContent=muted?'♫':'♪';$('soundBtn').style.background=muted?'':'#d2ff5a';beep();};
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let last=performance.now(),camTarget=new T.Vector3(),desired=new T.Vector3();camera.position.set(15,39,43);
const orbitView={key:null,yaw:0,pitch:PLAY_CAMERA.pitch};
function updateOrbitCamera(dt,targetYaw,targetPitch,distance,key){
 // Smooth angles, not world positions: a straight-line lerp cuts through the
 // orbit and shortens the boom during fast turns. Follow the rendered target.
 if(orbitView.key!==key){orbitView.key=key;orbitView.yaw=targetYaw;orbitView.pitch=targetPitch;}
 else{
  const blend=1-Math.exp(-Math.max(0,dt)*12),turn=targetYaw-orbitView.yaw;
  orbitView.yaw+=Math.atan2(Math.sin(turn),Math.cos(turn))*blend;
  orbitView.pitch=T.MathUtils.lerp(orbitView.pitch,targetPitch,blend);
 }
 const x=-Math.cos(orbitView.yaw),z=-Math.sin(orbitView.yaw);
 let elevation=-orbitView.pitch;
 // Keep the existing platform clearance by lifting along the orbit sphere,
 // rather than changing the distance from the target. Recheck newly covered tops.
 for(let attempt=0;attempt<=surfaces.length;attempt++){
  const horizontal=Math.cos(elevation)*distance;
  desired.set(camTarget.x+x*horizontal,camTarget.y+Math.sin(elevation)*distance,camTarget.z+z*horizontal);
  let clearY=desired.y;
  for(const surface of surfaces)if(contains(surface,desired.x,desired.z))clearY=Math.max(clearY,surface.y+1);
  const next=Math.asin(clamp((clearY-camTarget.y)/distance,-1,1));
  if(next<=elevation+1e-8)break;
  elevation=next;
 }
 camera.position.copy(desired);camera.lookAt(camTarget);
}
function humanInput(){
 const x=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),z=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),l=Math.hypot(x,z)||1;
 return {x:(x*Math.cos(yaw)-z*Math.sin(yaw))/l,z:(x*Math.sin(yaw)+z*Math.cos(yaw))/l,jump:!!keys.Space,jumpHeld:!!keys.Space};
}
function applyNetworkCommand(p,command){
 const input={x:command.x,z:command.z,jump:command.jump,jumpHeld:command.jump};
 p.netActions??={jump:0,dive:0,punch:0};
 for(const key of ['jump','dive','punch']){
  const serial=command.actions?.[key]||0;
  if(serial>p.netActions[key]){if(key==='jump'){input.jumpPressed=true;strugglePulse(p);}if(key==='dive')p.shiftAction=true;if(key==='punch')startPunch(p);p.netActions[key]=serial;}
 }
 if(!predictionPass){
  if(command.grab&&!isDiving(p)){p.grabIntent=!p.grabNeedsRelease;tryGrab(p);}
  else{releaseGrab(p,players);p.grabIntent=false;p.grabNeedsRelease=false;}
 }else p.grabIntent=!!command.grab&&!isDiving(p);
 recordGrabInput(p,input);return input;
}
function raceInput(p,dt){
 p.netMoves=null;let input;
 if(p.i===localId()){input=humanInput();input.jumpPressed=!!p.jumpRequested;p.jumpRequested=false;}
 else if(net?.isHost&&!isBot(p)){
   const remote=net.inputs.get(p.i),fresh=remote&&performance.now()-remote.received<500&&(!remote.sequenced||remote.round===round);
   p.netMoves=null;
   if(fresh&&remote.sequenced&&remote.round===round){
    p.netBudget=Math.min(.15,(p.netBudget||0)+dt);p.netMoves=[];
    while(remote.commands.length&&remote.commands[0].seq<=(p.netAck||0))remote.commands.shift();
    while(remote.commands.length&&p.netBudget>=STEP&&p.netMoves.length<6){p.netMoves.push(remote.commands.shift());p.netBudget-=STEP;}
    input=p.netMoves.length?applyNetworkCommand(p,p.netMoves[0]):{x:remote.x,z:remote.z,jump:remote.jump,jumpHeld:remote.jump};
    recordGrabInput(p,input);return input;
   }
   input=fresh?{x:remote.x,z:remote.z,jump:remote.jump,jumpHeld:remote.jump}:{x:0,z:0,jump:false,jumpHeld:false};
   p.netActions??={jump:0,dive:0,punch:0};
   if(fresh){for(const key of ['jump','dive','punch']){const serial=remote.actions[key]||0;if(serial>p.netActions[key]){if(key==='jump'){input.jumpPressed=true;strugglePulse(p);}if(key==='dive')p.shiftAction=true;if(key==='punch')startPunch(p);p.netActions[key]=serial;}}}
   if(fresh&&remote.grab&&!isDiving(p)){p.grabIntent=!p.grabNeedsRelease;tryGrab(p);}
   else{releaseGrab(p,players);p.grabIntent=false;p.grabNeedsRelease=false;}
 }else input=practiceMode?practiceInput(p,dt):bot(p,dt);
 recordGrabInput(p,input);return input;
}
function tick(now,networkClock=false){if(!networkClock)requestAnimationFrame(tick);if(net?.isHost&&net.running&&!networkClock)return;if(networkClock&&!(net?.isHost&&net.running))return;let dt=Math.min((now-last)/1000,.033);last=now;time+=dt;if(net?.isGuest&&net.running){guestFrame(dt);renderFrame(dt);return;}if(phase==='draft'){if(!practiceRoom){remaining-=dt;draftElapsed+=dt;let p=players.filter(isBot).find(p=>!p.pick&&draftElapsed>1.8+p.i*.55+((round+p.i)%3)*.2);if(p)aiPick(p);if(remaining<=0){for(let p of players)if(!p.pick)aiPick(p);}}}else if(phase==='build'){updateBuildAim(dt);if(!practiceRoom){remaining-=dt;buildElapsed+=dt;let p=players.filter(isBot).find(p=>!p.built&&buildElapsed>1+p.i*.8);if(p)aiBuild(p);if(phase==='build'&&(remaining<=0||players.every(p=>p.built)))beginRace();}}else if(phase==='race'){if(!practiceRoom)remaining-=dt;raceTime+=dt;traps(dt);if(grabHeld){localPlayer().grabIntent=!localPlayer().grabNeedsRelease;tryGrab(localPlayer());}const raceInputs=new Map();for(const p of players)if(p.alive&&!p.finished)raceInputs.set(p,raceInput(p,dt));updateGrabs(players,dt,punchBlocked,(p,holder)=>{if(p.i===localId())$('status').textContent='掙脫成功！';else if(holder.i===localId())$('status').textContent=p.name+' 掙脫了！放開右鍵後可再次抓取。';});for(let p of players){if(!p.alive||p.finished)continue;if(p.netMoves){for(let i=0;i<p.netMoves.length;i++){const command=p.netMoves[i],input=i?applyNetworkCommand(p,command):raceInputs.get(p);move(p,STEP,input);p.netAck=command.seq;}}else move(p,dt,raceInputs.get(p));if(isBot(p))aiPunch(p);}
 resolvePlayerContacts(players,dt);for(const p of players)if(p.alive&&!p.finished&&!p.ragdoll?.active)collisionWorld.depenetrate(p);updateCombat(players,dt,punchHit,punchBlocked);
 for(const p of players){if(p.alive&&!p.finished){p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=-p.facing;animateAnimal(p,dt);}
   else if(practiceMode){releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{alive:true,finished:false,x:p.i===localId()?-1:2+Math.floor(p.i/3)*1.4,z:p.i===localId()?0:(p.i%3-1)*2,y:0,vx:0,vz:0,vy:0,ground:surfaces[0]});}
 }
 impacts=impacts.filter(e=>{e.age+=dt;e.mesh.position.y+=dt*1.2;e.mesh.material.opacity=Math.max(0,1-e.age/.45);if(e.age>.45){world.remove(e.mesh);e.mesh.material.map.dispose();e.mesh.material.dispose();return false;}return true;});
 updateCombatHUD();
 if(!practiceMode&&(remaining<=0||players.every(p=>!p.alive||p.finished)))endRound();}
 renderFrame(dt);if(net?.isHost&&net.running)net.snapshot(networkSnapshot);
}
function updateBuildAim(dt){if(!placed){let f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),r=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),u=(keys.Space?1:0)-(keys.ControlLeft||keys.ControlRight?1:0),len=Math.hypot(f,r)||1;aim.x=clamp(aim.x+(f*Math.cos(buildView.yaw)-r*Math.sin(buildView.yaw))/len*22*dt,7,MAP.buildMaxX);aim.z=clamp(aim.z+(f*Math.sin(buildView.yaw)+r*Math.cos(buildView.yaw))/len*22*dt,-MAP.halfWidth,MAP.halfWidth);aim.y=clamp(aim.y+u*12*dt,-.5,MAP.maxBuildY);updateGhost();}}
function updateCombatHUD(){ const human=localPlayer();$('combatHint').hidden=false;
 let hint='左鍵出拳 · 右鍵抓人',meter=1-human.punchCooldown/COMBAT.cooldown;
 if(!human.alive||human.finished)hint='觀戰中';
 else if(isDown(human)){hint=human.downTime>0?(human.ground?'倒地中 · '+human.downTime.toFixed(1)+'s':'空中翻滾 · 等待落地'):'正在起身…';if(human.grabbedBy!==null)hint+=' · 起身後才能掙脫';meter=human.downTime>0?1-human.downTime/COMBAT.downSeconds:1-human.getUpTime/COMBAT.getUpSeconds;}
 else if(isDiving(human)){hint=human.diving?'飛撲中 · 無法出拳或抓人':'飛撲落地 · 正在恢復';meter=human.diving?0:1-human.diveRecovery/DIVE.recoverySeconds;}
 else if(human.grabbedBy!==null){hint='被抓住！持續移動 0.5 秒／Space 掙脫 '+Math.round(human.escapeProgress*100)+'%';meter=human.escapeProgress;}
 else if(human.grabbing!==null){const target=players.find(p=>p.i===human.grabbing);hint='抓住 '+target.name+' · 放開右鍵鬆手';meter=1-target.escapeProgress;}
 else if(grabHeld&&human.grabNeedsRelease){hint='對手已掙脫 · 鬆開右鍵後可再次抓取';meter=0;}
 else if(grabHeld){hint='伸手中 · 靠近正前方對手';meter=0;}
 else if(human.punchCooldown>0)hint='出拳冷卻 '+human.punchCooldown.toFixed(1)+'s · 右鍵抓人';
 $('combatHint').textContent=hint;$('combatHint').style.setProperty('--ready',(Math.max(0,meter)*100)+'%');
}
function renderFrame(dt){
 $('skipAI').hidden=!canSkipAIRound();$('skipAI').textContent=round===8?'結束本場派對 · N':'結束回合，下一回合 → · N';
 $('testRagdoll').hidden=!practiceMode||practiceRoom||phase!=='race';$('testImpact').hidden=!practiceMode||practiceRoom||phase!=='race';$('practiceObjects').hidden=!practiceRoom||phase!=='race';$('cancelPracticePlacement').hidden=!practiceRoom||phase!=='build';$('scorecard').hidden=practiceRoom;$('clockUnit').textContent=practiceRoom?'不限時間':'SECONDS';if(phase!=='race')$('combatHint').hidden=true;
 if(phase==='lobby'){facilities?.pose(time,false);for(let p of players){animateAnimal(p,dt,true);p.mesh.position.y=Math.sin(time*2+p.i)*.06;p.mesh.rotation.y=Math.sin(time*.3+p.i)*.2;}surfaces.forEach(s=>{if(s.type==='rotate'){s.mesh.rotation.x=Math.sin(time)*.6;updateSolidBounds(s);}if(s.type==='fan')s.mesh.userData.blades.rotation.x+=dt*10;});}
 $('clock').textContent=practiceMode?'∞':Math.max(0,Math.ceil(remaining));if(phase==='race'||phase==='build'){let focus=phase==='build'?aim:(localPlayer().alive&&!localPlayer().finished?localPlayer():players.filter(p=>p.alive&&!p.finished).sort((a,b)=>b.x-a.x)[0]);if(focus){if(net?.isGuest&&phase==='race')focus={...focus,...focus.mesh.position};let a=phase==='build'?buildView.yaw:focus.i===localId()?yaw:Math.atan2(focus.vz,focus.vx),b=phase==='build'?buildView.pitch:focus.i===localId()?pitch:PLAY_CAMERA.pitch;const previewBounds=phase==='build'&&localPlayer().pick!=='ice'?(isMoving(localPlayer().pick)?movingBounds(localPlayer().pick).clone().applyMatrix4(new T.Matrix4().makeRotationY(placementYaw)):shapeBounds(localPlayer().pick)):null,viewY=previewBounds?(previewBounds.min.y+previewBounds.max.y)/2:1.2;let distance=phase==='build'?(localPlayer().pick==='ice'?Math.max(14,ICE.radius*3.1):Math.max(10,Math.max(...previewBounds.getSize(new T.Vector3()).toArray())*1.8)*Math.max(1,1.4/camera.aspect)):PLAY_CAMERA.distance;const viewX=previewBounds?(previewBounds.min.x+previewBounds.max.x)/2:0,viewZ=previewBounds?(previewBounds.min.z+previewBounds.max.z)/2:0;camTarget.set(focus.x+viewX,focus.y+viewY,focus.z+viewZ);updateOrbitCamera(dt,a,b,distance,phase+':'+(phase==='build'?localPlayer().pick:focus.i));}players.forEach(p=>p.mesh.visible=p.alive&&!p.finished);$('crosshair').hidden=phase!=='build';}else{orbitView.key=null;players.forEach(p=>p.mesh.visible=p.alive&&!p.finished);$('crosshair').hidden=true;const fit=Math.max(1,1.65/camera.aspect);desired.set(MAP.goalX*.42,Math.max(26,MAP.goalX*.53)*fit,Math.max(36,MAP.goalX*.72)*fit);camTarget.set(MAP.goalX/2,2,0);camera.position.lerp(desired,1-Math.exp(-dt*3));camera.lookAt(camTarget);}renderer.render(scene,camera);}
const NETWORK_FIELDS=PLAYER_FIELDS.filter(k=>k!=='ground');
const rounded=n=>Math.round(n*10000)/10000;
const poseOf=o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].map(rounded);
function networkSnapshot(){
 return {mapSeed,phase,round,remaining,raceTime,expert,selection,finishOrder,facilityRocks:facilities?.snapshot()||[],
  title:$('phaseLabel').textContent,hint:$('phaseHint').textContent,
  result:{title:$('resultTitle').textContent,note:$('resultNote').textContent},
  surfaces:surfaces.map(s=>({id:s.id,type:s.type,x:(s.motionOrigin??s).x,y:(s.motionOrigin??s).y,z:(s.motionOrigin??s).z,angle:s.angle,w:s.designWidth,d:s.designDepth,h:s.designHeight,fixed:s.fixed,offset:s.offset,frozen:!!s.frozen})),
  players:players.map(p=>{const data={i:p.i,ground:p.ground?.id??null};for(const key of NETWORK_FIELDS)data[key]=p[key];const rig=p.mesh.userData.animal;
   data.actionAck={...(p.netActions??{})};
   if(isDown(p))data.pose={pivot:poseOf(rig.bodyPivot),bones:[...rig.bones.values()].map(b=>[...b.position.toArray(),...b.quaternion.toArray()].map(rounded)),label:p.mesh.userData.nameLabel.position.y};
   return data;
  }),
  shots:shots.map(b=>({id:b.id,x:b.mesh.position.x,y:b.mesh.position.y,z:b.mesh.position.z})),
  waves:waves.map(w=>({id:w.id,x:w.x,y:w.y,z:w.z,r:w.r}))};
}
function applyRoomRoster(){
 if(!net?.room)return;
 for(const p of players){const seat=net.room.members[p.i];if(!seat)continue;
  if(p.human!==seat.human){releasePlayerGrabs(p);p.think=0;p.plan=[];p.netActions={jump:0,dive:0,punch:0};p.netAck=0;p.netBudget=0;p.netMoves=null;net.inputs?.delete(p.i);}
  p.human=seat.human;
  if(p.name!==seat.name||p.labelLocal!==(p.i===localId())){
   p.name=seat.name;p.labelLocal=p.i===localId();const old=p.mesh.userData.nameLabel;
   p.mesh.remove(old);old.material.map?.dispose();old.material.dispose();
   const tag=label(p.name+(p.labelLocal?' · YOU':''));tag.position.y=2.4;tag.scale.set(2.4,.6,1);p.mesh.add(tag);p.mesh.userData.nameLabel=tag;
  }
 }
 scores();
}
function enterRoomLobby(){
 roomClock?.postMessage('stop');toLobby();phase='room';syncMouseLock();$('next').disabled=false;net.renderRoom();
}
function startNetworkMatch(room){
 unlockMouse();remoteTimeline.reset();localPrediction.reset();guestCarryOffset.set(0,0,0);networkMatch=room.match;networkFrameAt=0;placementPending=false;practiceMode=false;practiceRoom=false;
 $('count').value=String(room.capacity);$('difficulty').value=room.expert?'expert':'normal';
 $('next').disabled=!net.isHost;
 if(net.isHost){
  start();applyRoomRoster();
  if(!roomClock){roomClock=new Worker(new URL('./room-clock.js',import.meta.url));roomClock.onmessage=()=>tick(performance.now(),true);}
  roomClock.postMessage('start');
 }else{
  clean();makeMap();resetPlayers(room.capacity);applyRoomRoster();phase='sync';round=0;remaining=0;
  for(const id of ['lobby','previewNote','draft','buildTools','results','roomPanel'])show(id,false);
  show('hud',true);$('phaseLabel').textContent='正在同步地圖…';$('status').textContent='已加入，等待房主的遊戲狀態。';
 }
 net.renderRoom();
}
function hostCommand(m){
 if(!net?.isHost||m.round!==round||!net.room.members[m.slot]?.human)return;
 const p=players[m.slot];if(!p)return;
 if(m.command==='claim'&&phase==='draft')claim(p,m.index);
 if(m.command==='place'&&phase==='build'&&!p.built){
  const a={x:m.x,y:m.y,z:m.z};
  if(!legal(a,p.pick,m.angle)){net.send({type:'notice',slot:m.slot,message:placementError(p.pick)});return;}
  placeObject(p.pick,a,m.angle);p.built=true;advanceWhenReady();
 }
}
let draftSignature='',remoteScoreSignature='';
function receiveNetworkState(s){
 if(!net?.isGuest||s.match!==networkMatch||s.seq<=networkFrameAt)return;
 networkFrameAt=s.seq;
 const mapChanged=Number.isInteger(s.mapSeed)&&s.mapSeed!==mapSeed;
 if(mapChanged){clean();makeMap(s.mapSeed);resetPlayers(s.players.length);applyRoomRoster();}
 const changed=mapChanged||s.phase!==phase||s.round!==round;
 if(changed){remoteTimeline.reset();localPrediction.reset();guestCarryOffset.set(0,0,0);if(net.commandQueue)net.commandQueue.length=0;}
 remoteTimeline.push(s,performance.now()/1000);
 remaining=s.remaining;raceTime=s.raceTime;expert=s.expert;round=s.round;finishOrder=s.finishOrder;
 for(const spec of s.surfaces){
  let surface=surfaces[spec.id];if(!surface)surface=addSurface(spec.type,spec.x,spec.z,spec.y,spec.angle,spec.w,spec.d,spec.fixed,spec.h??.55);
  surface.offset=spec.offset;if(spec.frozen)freezeSurface(surface);
 }
 if(s.phase!=='race')movers?.pose(0);
 for(const data of s.players){const p=players[data.i];if(!p)continue;
  for(const key of NETWORK_FIELDS)if(data[key]!==undefined)p[key]=data[key];
  p.ground=data.ground==null?null:surfaces[data.ground];p.remotePose=data.pose;p.actionAck=data.actionAck;
  if(changed){p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=-p.facing;}
 }
 const picked=JSON.stringify(s.selection)+localPlayer().pick;selection=s.selection;
 if(changed){
  setPhase(s.phase,remaining,s.title,s.hint);placementPending=false;clearMouseInput();
  show('draft',phase==='draft');show('buildTools',phase==='build');show('results',phase==='results');
  clearGhost();
  if(phase==='build'){
   placed=!!localPlayer().built;placementYaw=0;buildView.yaw=0;buildView.pitch=-.5;
   $('pickedName').textContent=info(localPlayer().pick)[2];aim=suggest(localPlayer().pick);if(!placed){makeGhost();updateGhost();}
   $('controls').textContent='滑鼠轉鏡頭 · WASD 移動 · Space ↑ Ctrl ↓ · R 轉物件 · Enter 放置';
  }else if(phase==='race'){
   yaw=0;pitch=PLAY_CAMERA.pitch;grabHeld=false;
   $('controls').textContent='滑鼠轉視角 · WASD 移動 · Space 短／長跳・掙脫 · Shift 飛撲 · 左鍵拳 · 右鍵抓';
  }else if(phase==='draft')$('controls').textContent='點擊搶物件 · 每人一件 · 先搶先得';
  if(phase==='results'){
   $('resultEyebrow').textContent=round===8?'PARTY COMPLETE':'ROUND COMPLETE';
   $('resultTitle').textContent=s.result.title;$('resultNote').textContent=s.result.note;
   $('resultRows').innerHTML=[...players].sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="resultrow"><span>${i+1}</span><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${html(p.name)}<small>${p.finished?'抵達':'未抵達'}${p.roundKnockouts?' · 擊落 '+p.roundKnockouts:''}</small><b>${p.score} <small>+${p.delta}</small></b></div>`).join('');
   $('next').disabled=true;$('next').textContent=round===8?'等待房主返回房間':'等待房主開始下一回合';
  }
  $('aiNote').textContent='真人同步連線中 · 空位與離線玩家由 AI 接手。';
 }
 if(phase==='draft'&&(changed||picked!==draftSignature)){renderDraft();draftSignature=picked;}
 if(phase==='build'){
  placed=!!localPlayer().built;if(placed){if(placementPending)$('status').textContent='已放置！等待其他玩家，準備出發。';placementPending=false;clearGhost();}
  $('ready').disabled=placed||placementPending;$('ready').textContent=placed?'已放置 ✓':placementPending?'確認中…':'確認放置 ✓';
 }
 const own=s.players[localId()];
 if(own&&s.phase==='race')localPrediction.reconcile(own,s.raceTime,makePredictedActor,predictionEnabled(own));
 const signature=players.map(p=>[p.name,p.score,p.alive,p.finished].join(':')).join('|');if(signature!==remoteScoreSignature){remoteScoreSignature=signature;scores();}
}
function syncRemoteEffects(s){
 while(shots.length>s.shots.length){const b=shots.pop();world.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}
 s.shots.forEach((b,i)=>{shots[i]??={mesh:sphere(.3,0x303f41,world)};shots[i].mesh.position.set(b.x,b.y,b.z);});
 while(waves.length>s.waves.length){const w=waves.pop();world.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();}
 s.waves.forEach((w,i)=>{if(!waves[i]){const mesh=createWaveMesh();world.add(mesh);waves[i]={mesh};}waves[i].mesh.position.set(w.x,w.y,w.z);setWaveRadius(waves[i].mesh,w.r);});
}
function predictionEnabled(p){return p.alive&&!p.finished&&!isDown(p)&&!p.pendingKnockdown&&p.grabbedBy==null&&p.grabbing==null;}
function predictionReference(p,at){return isMoving(p.ground)?{...movingPosition(p.ground,at),key:p.ground.id}:null;}
function makePredictedActor(data){
 const base=localPlayer();return {...base,...data,mesh:base.mesh,ground:data.ground==null?null:surfaces[data.ground],ragdoll:null,plan:[],netActions:{...(data.actionAck||{})},predTime:raceTime,shiftAction:false};
}
function predictStep(p,command,dt,at){
 if(!predictionEnabled(p))return;
 const previous=p.predTime??at-dt;
 movers?.pose(at);
 // Replays can rewind the physics clock; derive carrier velocity from its path.
 for(const surface of movers?.platforms||[])surface.motionVelocity.copy(movingPosition(surface,at+STEP/2).sub(movingPosition(surface,at-STEP/2)).divideScalar(STEP));
 for(const surface of surfaces)if(surface.type==='rotate'){surface.mesh.rotation.x=Math.sin((at+surface.offset)*.85)*1.45;updateSolidBounds(surface);}
 facilities?.pose(at,true);
 if(isMoving(p.ground))movers.carry(p,p.ground,movingPosition(p.ground,at).sub(movingPosition(p.ground,previous)));
 p.predTime=at;
 for(const key of ['stagger','hazardCooldown','punchCooldown','hitFlash'])p[key]=Math.max(0,(p[key]||0)-dt);
 if(p.punchTime>=0){p.punchTime+=dt;if(p.punchTime>COMBAT.duration)p.punchTime=-1;}
 predictionPass=true;
 try{move(p,dt,applyNetworkCommand(p,command));}finally{predictionPass=false;}
}
const remotePoint=new T.Vector3(),remoteQuaternion=new T.Quaternion(),otherQuaternion=new T.Quaternion();
function applyRemotePose(p,a,b,t){
 const rig=p.mesh.userData.animal,pose=t>=1?(b??a):(a??b);if(!pose)return;
 const next=a&&b?b:pose,alpha=a&&b?t:0;
 function apply(object,left,right,scale=false){
  object.position.fromArray(left).lerp(remotePoint.fromArray(right),alpha);
  object.quaternion.fromArray(left,3).slerp(otherQuaternion.fromArray(right,3),alpha).normalize();
  if(scale)object.scale.fromArray(left,7).lerp(remotePoint.fromArray(right,7),alpha);
 }
 apply(rig.bodyPivot,pose.pivot,next.pivot,true);
 let j=0;for(const bone of rig.bones.values()){const left=pose.bones[j],right=next.bones[j++];if(left&&right)apply(bone,left,right);}
 p.mesh.userData.nameLabel.position.y=pose.label+(next.label-pose.label)*alpha;p.mesh.updateMatrixWorld(true);
 for(const side of ['L','R']){const foot=rig.bones.get('Foot'+side),shin=rig.bones.get('LowerLeg'+side);foot.position.copy(foot.parent.worldToLocal(shin.localToWorld(rig.feet.get(side).ankle.clone())));}
}
function interpolateEffects(a=[],b=[],alpha){
 const later=new Map(b.map((v,i)=>[v.id??i,v]));
 return (alpha>=1?b:a).map((v,i)=>{const to=later.get(v.id??i);if(!to)return v;const value={...v};for(const k of ['x','y','z','r'])if(typeof v[k]==='number'&&typeof to[k]==='number')value[k]=v[k]+(to[k]-v[k])*alpha;
  if(v.q&&to.q)value.q=new T.Quaternion().fromArray(v.q).slerp(otherQuaternion.fromArray(to.q),alpha).toArray();return value;});
}
function guestFrame(dt){
 if(phase==='build')updateBuildAim(dt);
 const own=localPlayer(),fresh=performance.now()-net.lastReceive<500;
 if(phase==='race'){
  const input={...humanInput(),grab:grabHeld,actions:net.actions??{},round};
  const commands=localPrediction.advance(dt,input,fresh&&predictionEnabled(own));
  net.input(input,commands);updateCombatHUD();
  if(!fresh)$('status').textContent='等待房主同步…';
 }
 const sample=remoteTimeline.sample(dt,performance.now()/1000);if(!sample)return;guestSample=sample;
 const {a,b,alpha}=sample;
 movers?.pose(phase==='race'?sample.time:0,false,false);
 facilities?.receive(interpolateEffects(a.facilityRocks,b.facilityRocks,alpha),sample.time);
 syncRemoteEffects({shots:interpolateEffects(a.shots,b.shots,alpha),waves:interpolateEffects(a.waves,b.waves,alpha)});
 for(const surface of surfaces){
  if(surface.type==='rotate'){surface.mesh.rotation.x=Math.sin((sample.time+surface.offset)*.85)*1.45;surface.mesh.updateMatrixWorld(true);}
  if(surface.type==='fan')surface.mesh.userData.blades.rotation.x=sample.time*16;
 }
 for(const p of players){
  const left=a.players[p.i],right=b.players[p.i];if(!left)continue;
  let state=interpolateActor(left,right,alpha),predicted=false;
  if(p.i===localId()&&phase==='race'&&fresh&&predictionEnabled(p)&&localPrediction.actor){
   state=localPrediction.render();predicted=true;
   const ground=state.ground;
   if(isMoving(ground))guestCarryOffset.copy(movingPosition(ground,sample.time)).sub(movingPosition(ground,localPrediction.renderTime));
   else guestCarryOffset.multiplyScalar(Math.exp(-dt*12));
   state.x+=guestCarryOffset.x;state.y+=guestCarryOffset.y;state.z+=guestCarryOffset.z;
  }else{
   state.ground=state.ground==null?null:surfaces[state.ground];
   if(isMoving(state.ground)&&left.ground===right?.ground){
    const originA=movingPosition(state.ground,a.raceTime),originB=movingPosition(state.ground,b.raceTime),originNow=movingPosition(state.ground,sample.time);
    state.x=left.x-originA.x+(right.x-originB.x-left.x+originA.x)*alpha+originNow.x;
    state.y=left.y-originA.y+(right.y-originB.y-left.y+originA.y)*alpha+originNow.y;
    state.z=left.z-originA.z+(right.z-originB.z-left.z+originA.z)*alpha+originNow.z;
   }
  }
  if(p.i===localId()){
   if(p.renderModePredicted!==undefined&&p.renderModePredicted!==predicted&&p.renderState){p.renderTransition=new T.Vector3(p.renderState.x-state.x,p.renderState.y-state.y,p.renderState.z-state.z);if(p.renderTransition.length()>2.5)p.renderTransition.set(0,0,0);}
   p.renderModePredicted=predicted;
   if(p.renderTransition){p.renderTransition.multiplyScalar(Math.exp(-dt*14));state.x+=p.renderTransition.x;state.y+=p.renderTransition.y;state.z+=p.renderTransition.z;}
  }
  p.renderState=state;p.mesh.position.set(state.x,state.y,state.z);p.mesh.rotation.y=-state.facing;p.mesh.visible=state.alive&&!state.finished;
  const view={...state,mesh:p.mesh,ragdoll:null};
  if(!predicted&&isDown(state)&& (left.pose||right?.pose))applyRemotePose(p,left.pose,right?.pose,alpha);
  else{if(p.wasRemotePose)resetAnimal(p.mesh);animateAnimal(view,dt);}
  p.wasRemotePose=!predicted&&isDown(state)&&!!(left.pose||right?.pose);
  const rig=p.mesh.userData.animal;rig.grabRing.visible=state.grabbedBy!=null;rig.grabRing.material.color.setHex(state.escapeProgress>.6?0xffffff:0xffb765);
 }
}

function setupMultiplayer(){
 net=new PartyNetwork({
  onRoom:room=>{if(!room.running){if(phase!=='room')enterRoomLobby();}else applyRoomRoster();},
  onStart:startNetworkMatch,onState:receiveNetworkState,onCommand:hostCommand,
  onNotice:message=>{placementPending=false;$('ready').disabled=false;$('status').textContent=message;},
  onStall:()=>{clearMouseInput();$('status').textContent='連線中斷，正在重連；AI 暫時接手。';},
  onLobby:enterRoomLobby,onClose:()=>{roomClock?.postMessage('stop');toLobby();$('next').disabled=false;}
 });
}
async function boot(){
 try{await loadCharacters();toLobby();setupMultiplayer();$('lobby').inert=false;$('loading').remove();requestAnimationFrame(tick);}
 catch(error){console.error(error);$('loading').textContent='角色載入失敗，請重新整理頁面再試一次。';}
}
boot();
// Diagnostics expose state only.
window.partyDebug={get state(){return {phase,round,remaining,practiceRoom,surfaces:surfaces.length,players:players.map(p=>({name:p.name,x:p.x,y:p.y,z:p.z,alive:p.alive,finished:p.finished,score:p.score}))};}};
