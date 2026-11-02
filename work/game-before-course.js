import * as T from './three.module.js';
import { loadCharacters, createAnimal, animateAnimal, resetAnimal } from './characters.js';
import { COMBAT, resetCombat, startPunch, updateCombat, integrateImpulse, resolvePlayerContacts, isDown, isDiving, knockDown, hazardImpact, startGrab, releaseGrab, clearGrabs, updateGrabs, strugglePulse } from './combat.js';
import { CollisionWorld } from './collision.js';
import { beginRagdoll, stepRagdoll, beginRecovery } from './ragdoll.js';
import { DivePlanner } from './ai-dive.js';
import { PartyNetwork } from './network.js';
const $=id=>document.getElementById(id), clamp=T.MathUtils.clamp;
const TYPES=[['platform','▰','雲朵平台','穩穩站好，搭出一條生路',0xa9d879],['rotate','◈','旋轉方塊','傾角超過 60° 會滑落',0xb09ee8],['bounce','↟','彈跳床','跳得更高，也可能飛太遠',0xf2c957],['fire','♨','噴火器','週期噴火，先看預告',0xf18d62],['spike','▲','尖刺','碰到會彈飛，落地暫時倒地',0xe888a7],['cannon','●','砲台','自動發射擊飛砲彈',0x7e9baa],['fan','✳','電風扇','順風起飛，逆風小心',0x77d3d2],['field','◎','波紋力場','水平波紋會把角色擊飛',0x9ca5ee]];
const MAP={goalX:216,goalY:24,buildMaxX:207,halfWidth:48,maxBuildY:40,raceSeconds:105};
const MOTION={groundResponse:14,airAcceleration:5.5,turnResponse:30,maxTurnSpeed:26};
const DIVE={minSpeed:8,maxSpeed:11,boost:3.5,poseSeconds:.12,recoverySeconds:.3};
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
let surfaces=[],players=[],shots=[],waves=[],phase='lobby',remaining=0,round=0,time=0,raceTime=0,expert=true,selection=[],draftElapsed=0,buildElapsed=0,placed=false,placementYaw=0,ghost=null,aim={x:10,z:0,y:0},keys={},finishOrder=[],firstAwarded=false,muted=true,audio,yaw=0,pitch=-.32;
const buildView={yaw:0,pitch:-.5};
let practiceMode=false, grabPractice=false, impacts=[], grabHeld=false;
let net=null,roomClock=null,networkFrameAt=0,networkMatch=0,placementPending=false;
const localId=()=>net?.online?net.slot:0,localPlayer=()=>players[localId()];
const isBot=p=>net?.running?!net.room.members[p.i]?.human:p.i>0;
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rotateView(dx,dy,sensitivity=.005){
 if(phase==='build'){buildView.yaw+=dx*sensitivity;buildView.pitch=clamp(buildView.pitch-dy*sensitivity,-1.15,.4);}
 else if(phase==='race'){yaw+=dx*sensitivity;pitch=clamp(pitch-dy*sensitivity,-1.15,.4);}
}
function rotatePlacement(){if(phase!=='build'||placed)return;placementYaw=(placementYaw+Math.PI/2)%(Math.PI*2);updateGhost();}
function beep(freq=600,duration=.08){if(muted)return;try{audio??=new AudioContext();let o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=freq;g.gain.setValueAtTime(.04,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.start();o.stop(audio.currentTime+duration);}catch{}}

function model(type,w=3.6,d=3.6){
 const g=new T.Group();
 if(type==='platform'){
  const deck=box(w,.55,d,0xa9d879,g);deck.position.y=-.275;deck.name='platform-deck';
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
  const rail=box(2.2,.15,.22,0xa96d89,g);rail.position.y=.05;
  for(const x of [-.75,0,.75]){
   const spike=new T.Mesh(new T.ConeGeometry(.32,.95,4),mat(0xf5f2e9));
   spike.position.set(x,.6,0);spike.castShadow=true;g.add(spike);
  }
 }else if(type==='fire'||type==='cannon'){
  const body=box(1.05,.95,1.15,type==='fire'?0xd8754c:0x54756b,g);body.position.set(-.3,.475,0);g.userData.base=body;
  const barrel=cyl(type==='fire'?.28:.36,1.65,type==='fire'?0x9c4930:0x344d4d,g);
  barrel.rotation.z=Math.PI/2;barrel.position.set(.35,.9,0);
  if(type==='fire'){
   const flame=new T.Mesh(new T.ConeGeometry(.6,5.4,12),mat(0xffa32c,{transparent:true,opacity:.8,emissive:0xff5c11,emissiveIntensity:.6}));
   flame.rotation.z=-Math.PI/2;flame.position.set(3.8,.9,0);flame.userData.effect=true;g.add(flame);g.userData.flame=flame;
  }
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
 g.userData.localBounds=localBox;
 return g;
}
const shapeCache=new Map();
function shapeBounds(type,w=3.6,d=3.6){
 const key=type+':'+w+':'+d;
 if(!shapeCache.has(key)){
  const g=model(type,w,d);shapeCache.set(key,g.userData.localBounds.clone());
  g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 }
 return shapeCache.get(key);
}
function updateSolidBounds(s){
 s.mesh.updateMatrixWorld(true);
 s.walkHeight=null;
 s.worldBounds.makeEmpty();
 for(const mesh of s.mesh.userData.solids)s.worldBounds.union(new T.Box3().setFromObject(mesh));
 collisionWorld.update(s);
}


function addSurface(type,x,z,y=0,angle=0,w=3.6,d=3.6,fixed=false){
 const mesh=model(type,w,d);mesh.position.set(x,y,z);mesh.rotation.y=angle;world.add(mesh);
 const size=mesh.userData.localBounds.getSize(new T.Vector3());
 const s={id:surfaces.length,type,x,z,y,w:size.x,d:size.z,designWidth:w,designDepth:d,angle,mesh,fixed,offset:Math.random()*3,lastShot:-3,lastWave:-3,worldBounds:new T.Box3()};
 updateSolidBounds(s);surfaces.push(s);return s;
}
function ext(s){const c=Math.abs(Math.cos(s.angle)),n=Math.abs(Math.sin(s.angle));return {x:(s.w*c+s.d*n)/2,z:(s.d*c+s.w*n)/2};}
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
function clean(){grabHeld=false;grabPractice=false;clearGrabs(players);collisionWorld.clear();for(const p of players)p.mesh.userData.dispose?.();impacts=[];for(const s of [...shots,...waves]){world.remove(s.mesh);}shots=[];waves=[];while(world.children.length){const o=world.children[0];world.remove(o);o.traverse(v=>{v.geometry?.dispose();if(v.material){for(const m of Array.isArray(v.material)?v.material:[v.material]){m.map?.dispose();m.dispose();}}});}surfaces=[];players=[];ghost=null;}

function makeMap(){
 addSurface('platform',0,0,0,0,14,18,true);
 addSurface('platform',108,0,12,0,14,20,true);
 addSurface('platform',MAP.goalX,0,MAP.goalY,0,18,24,true);
 for(const [x,z] of [[27,-6],[54,8],[81,-6],[135,6],[162,-8],[189,6]])addSurface('platform',x,z,x/9,0,12,20,true);
 for(const s of surfaces){const slab=box(s.w*.8,4,s.d*.8,0x78aaa1,s.mesh);slab.position.set(0,-2.5,0);s.mesh.userData.solids.push(slab);updateSolidBounds(s);}
 const gate=new T.Group();
 for(const z of [-4,4]){const p=box(.4,6,.4,0x325d4d,gate);p.position.set(0,3,z);}
 const top=box(.4,.7,8.4,0xc9f96a,gate);top.position.y=5.7;
 const finish=label('FINISH');finish.position.set(0,5.7,0);gate.add(finish);
 gate.position.set(MAP.goalX+2,MAP.goalY,0);world.add(gate);
 for(const m of [...gate.children])if(m.isMesh){m.position.x+=2;surfaces[2].mesh.add(m);surfaces[2].mesh.userData.solids.push(m);}
 updateSolidBounds(surfaces[2]);
 for(const z of [-6,6]){const p=box(.18,3,.18,0xf9faec,surfaces[0].mesh);p.position.set(5,1.5,z);const flag=box(1,.7,.06,0xf09369,surfaces[0].mesh);flag.position.set(5.5,2.6,z);surfaces[0].mesh.userData.solids.push(p,flag);}
 updateSolidBounds(surfaces[0]);
 for(const x of [27,54,81,108,135,162,189,216]){const l=label('↑ '+Math.round(x/9)+'m','#648479');l.position.set(x,x/9-5,-16);world.add(l);}
}

function resetPlayers(n){for(let i=0;i<n;i++){let p={i,name:i===0?'你':['Mochi','Nova','Kiwi','Miso','Bolt','Luna','Tofu','Pepper','Bean'][i-1],mesh:character(i),score:0,delta:0,x:0,z:0,y:0,vx:0,vz:0,vy:0,alive:true,finished:false,ground:null,pick:null,plan:[],think:0,jumpCD:0,wait:0,personality:.8+Math.random()*.4};players.push(p);}spawn();}
function spawn(){grabHeld=false;clearGrabs(players);players.forEach((p,i)=>{resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:-2+(i%3)*1.1,z:-3+Math.floor(i/3)*1.7,y:.05,vx:0,vz:0,vy:0,alive:true,finished:false,ground:surfaces[0],plan:[],think:0,jumpCD:0,delta:0,noRoute:0,giveUp:false,launchSurface:null});p.mesh.visible=true;p.mesh.position.set(p.x,p.y,p.z);});finishOrder=[];}
function show(id,b){$(id).hidden=!b;}
function scores(){ $('scores').innerHTML=[...players].sort((a,b)=>b.score-a.score).map(p=>`<div class="score ${p.i===localId()?'me':''}"><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${html(p.name)}<span>${p.finished?'⚑':!p.alive?'×':''}</span><b>${p.score}</b></div>`).join('');}
function setPhase(p,sec,title,hint){phase=p;if(!canLockMouse())unlockMouse();syncMouseLock();remaining=sec;$('phaseLabel').textContent=title;$('phaseHint').textContent=hint;$('status').textContent='';$('roundLabel').textContent=`ROUND ${String(round).padStart(2,'0')} / 08`;scores();}
function start(){practiceMode=false;clean();makeMap();expert=$('difficulty').value==='expert';resetPlayers(+$('count').value);round=0;show('lobby',false);show('previewNote',false);show('hud',true);beginRound();}
function beginRound(){round++;spawn();players.forEach(p=>{p.pick=null;p.built=false;});show('results',false);show('buildTools',false);selection=[];let n=players.length;for(let i=0;i<n+2;i++){let t=i<Math.ceil(n*.55)?'platform':TYPES[1+Math.floor(Math.random()*7)][0];selection.push({type:t,owner:null});}selection.sort(()=>Math.random()-.5);draftElapsed=0;setPhase('draft',12,'搶物件','選一件道具。AI 也在等著出手！');show('draft',true);renderDraft();$('controls').textContent='滑鼠點擊搶物件 · 每人一件';$('aiNote').textContent='AI 策略：優先取得平台補路，後續回合增加陷阱。';}
function renderDraft(){$('items').innerHTML=selection.map((s,i)=>{let t=info(s.type);return `<button class="item" data-item="${i}" ${s.owner!==null||localPlayer().pick?'disabled':''}><span class="glyph" style="color:#${t[4].toString(16)}">${t[1]}</span><strong>${t[2]}</strong><small>${t[3]}</small><span class="owner">${s.owner!==null?players[s.owner].name:''}</span></button>`;}).join('');$('items').querySelectorAll('button').forEach(b=>b.onclick=()=>claim(localPlayer(),+b.dataset.item));}
function claim(p,i){if(net?.isGuest){net.send({type:'command',command:'claim',index:i,round});return;}if(phase!=='draft'||p.pick||selection[i]?.owner!==null)return;selection[i].owner=p.i;p.pick=selection[i].type;beep(p.i?300:750);renderDraft();if(players.every(p=>p.pick))beginBuild();}
function aiPick(p){let available=selection.map((s,i)=>({...s,i})).filter(s=>s.owner===null);available.sort((a,b)=>pickValue(b.type,p)-pickValue(a.type,p));if(available[0])claim(p,available[0].i);}
function pickValue(t,p){return (t==='platform'?round<3?8:4:t==='bounce'?5:t==='fan'?3:2)+Math.random()*3;}
function beginBuild(){placementPending=false;show('draft',false);setPhase('build',15,'搭出你的勝算','點擊畫面鎖定滑鼠；Esc 解除。滑鼠轉鏡頭、R 轉物件。綠色可放。');show('buildTools',true);placed=false;placementYaw=0;buildElapsed=0;$('height').value='0';$('pickedName').textContent=info(localPlayer().pick)[2];$('ready').disabled=false;$('ready').textContent='確認放置 ✓';makeGhost();aim=suggest(localPlayer().pick);buildView.yaw=0;buildView.pitch=-.5;updateGhost();$('controls').textContent='滑鼠轉鏡頭 · WASD 移動 · Space ↑ Ctrl ↓ · R 轉物件 · Enter 放置';$('aiNote').textContent='AI 正在評估缺口與替代路線，建議位置也可交給 AI。';}
function makeGhost(){if(ghost)world.remove(ghost);ghost=model(localPlayer().pick);ghost.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.5;o.material.depthWrite=false;}});world.add(ghost);}

function bounds(s){
 if(s.placementBounds)return s.placementBounds;
 const localBox=shapeBounds(s.type,s.type==='platform'?(s.designWidth??s.w):3.6,s.type==='platform'?(s.designDepth??s.d):3.6).clone();
 if(s.type==='rotate'){localBox.min.set(-1.55,-1.85,-1.85);localBox.max.set(1.55,1.85,1.85);}
 const m=new T.Matrix4().compose(new T.Vector3(s.x,s.y,s.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),s.angle),new T.Vector3(1,1,1));
 const b=localBox.applyMatrix4(m);
 const result={minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};if(s.mesh)s.placementBounds=result;return result;
}
function legal(a,t=localPlayer()?.pick,angle=placementYaw){
 if(a.x<7||a.x>MAP.buildMaxX||Math.abs(a.z)>MAP.halfWidth||a.y<-.5||a.y>MAP.maxBuildY)return false;
 const q=bounds({type:t,x:a.x,z:a.z,y:a.y,w:3.6,d:3.6,angle});
 return !surfaces.some(s=>{const r=bounds(s);return q.minX<r.maxX-.02&&q.maxX>r.minX+.02&&q.minY<r.maxY-.02&&q.maxY>r.minY+.02&&q.minZ<r.maxZ-.02&&q.maxZ>r.minZ+.02;});
}

function updateGhost(){if(!ghost)return;$('coords').textContent='X '+aim.x.toFixed(1)+' · Y '+aim.y.toFixed(1)+' · Z '+aim.z.toFixed(1)+' · 物件 '+Math.round(placementYaw*180/Math.PI)+'°';ghost.position.set(aim.x,aim.y,aim.z);ghost.rotation.y=placementYaw;let ok=legal(aim);ghost.traverse(o=>{if(o.material)o.material.color.setHex(ok?0x72d485:0xf06a67);});}
function suggest(type){let reach=new Set([surfaces[0]]),queue=[surfaces[0]];while(queue.length){let s=queue.shift();for(let v of surfaces)if(!reach.has(v)&&v.type!=='spike'&&gap(s,v)<4.1&&walkY(v)-walkY(s)<=1.45&&walkY(s)-walkY(v)<4){reach.add(v);queue.push(v);}}let best=null,bestV=-Infinity;for(let x=10;x<=MAP.buildMaxX;x+=3)for(let z=-18;z<=18;z+=3)for(let dy of [-.5,0,.5]){let a={x,z,y:Math.round((x/9+dy)*2)/2};if(!legal(a,type))continue;let nearest=99,left=false,right=false;for(let s of surfaces){let e=ext(s),g=Math.hypot(Math.max(0,Math.abs(x-s.x)-e.x-1.8),Math.max(0,Math.abs(z-s.z)-e.z-1.8));if(Math.abs(s.y-a.y)<1.5){nearest=Math.min(nearest,g);if(g<3.6&&s.x<x&&reach.has(s)&&a.y-s.y<=1.4)left=true;if(g<4&&s.x>x)right=true;}}if(!left)continue;let value=10+(right?3:0)-Math.abs(nearest-2.4)*.5-Math.abs(z)*.25+x*.35;if(nearest>4.2)value-=40;if(type!=='platform'&&type!=='bounce')value-=Math.abs(z-6)*.2;if(value>bestV){bestV=value;best=a;}}return best||{x:10,z:0,y:2};}
function placeHuman(){if(net?.isGuest){if(phase!=='build'||placed||placementPending)return;if(!legal(aim)){$('status').textContent='這裡會重疊，換個位置或高度。';return;}placementPending=true;net.send({type:'command',command:'place',...aim,angle:placementYaw,round});$('ready').disabled=true;$('status').textContent='正在確認放置…';return;}if(phase!=='build'||placed)return;if(!legal(aim)){$('status').textContent='這裡會重疊，換個位置或高度。';return;}addSurface(localPlayer().pick,aim.x,aim.z,aim.y,placementYaw);localPlayer().built=true;placed=true;world.remove(ghost);ghost=null;$('status').textContent='已放置！等待其他玩家，準備出發。';$('ready').disabled=true;$('ready').textContent='已放置 ✓';beep(850);}
function aiBuild(p){let a=suggest(p.pick);if(!legal(a,p.pick,0)){p.built=true;return;}addSurface(p.pick,a.x,a.z,a.y,0);p.built=true;}
function beginRace(){if(!placed){if(!legal(aim))aim=suggest(localPlayer().pick);placeHuman();}for(let p of players.slice(1))if(!p.built)aiBuild(p);if(ghost){world.remove(ghost);ghost=null;}show('buildTools',false);setPhase('race',MAP.raceSeconds,'跑起來！','到達綠色終點門獲得分數。拳擊會擊退；陷阱命中立即布娃娃翻滾，落地後才會起身；掉進雲海才淘汰。');spawn();raceTime=0;yaw=0;pitch=-.06;for(let s of surfaces){s.lastShot=-3;s.lastWave=-3;}$('controls').textContent='滑鼠轉視角 · WASD 移動 · Space 跳躍／掙脫 · Shift 飛撲 · 左鍵拳 · 右鍵抓';$('aiNote').textContent='高手 AI：動態尋路 → 預測落點與煞停 → 跳躍／飛撲 → 避開危險。';beep(1000,.2);}
function gap(a,b){let ea=ext(a),eb=ext(b);return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-ea.x-eb.x),Math.max(0,Math.abs(a.z-b.z)-ea.z-eb.z));}
function canJump(a,b){
 const dy=walkY(b)-walkY(a);
 if(a.type!=='bounce')return gap(a,b)<=4.4&&dy<=1.45&&dy>-4;
 if(dy>3.6||dy<-8)return false;
 const e=ext(b),dx=Math.max(0,Math.abs(a.x-b.x)-Math.max(0,e.x-.55)),dz=Math.max(0,Math.abs(a.z-b.z)-Math.max(0,e.z-.55));
 const flight=(14+Math.sqrt(196-44*dy))/22;
 return Math.hypot(dx,dz)<7*flight-.65;
}
function canTraverse(a,b){return canJump(a,b)||!!divePlanner.link(a,b,expert?7:6.4);}
function route(start,p){const goal=surfaces[2],dist=new Map([[start,0]]),prev=new Map(),open=new Set([start]);while(open.size){let u=[...open].sort((a,b)=>dist.get(a)-dist.get(b))[0];open.delete(u);if(u===goal)break;for(let v of surfaces){if(v===u||v.type==='spike'||!canTraverse(u,v))continue;let risk=v.type==='platform'?0:v.type==='bounce'?.6:v.type==='fan'?1.8:expert?5:1;let cost=dist.get(u)+Math.hypot(u.x-v.x,u.z-v.z)+risk*p.personality+(canJump(u,v)?0:3)+(v.x<u.x?8:0);if(cost<(dist.get(v)??Infinity)){dist.set(v,cost);prev.set(v,u);open.add(v);}}}if(!dist.has(goal)){let candidates=[...dist.keys()].filter(s=>s.type!=='spike');let far=candidates.sort((a,b)=>b.x-a.x)[0];return recover(far,prev,start);}return recover(goal,prev,start);}
function recover(end,prev,start){let out=[],u=end;for(let i=0;u&&u!==start&&i<100;i++){out.unshift(u);u=prev.get(u);}return out;}
function activeFire(s){let f=(raceTime+s.offset)%4.5;return f>2&&f<3.6;}
function local(s,p){let dx=p.x-s.x,dz=p.z-s.z;return {x:dx*Math.cos(s.angle)-dz*Math.sin(s.angle),z:dx*Math.sin(s.angle)+dz*Math.cos(s.angle)};}
function aiAirInput(p,target,dt){
 if(isDiving(p))return {x:0,z:0,jump:false};
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
 const choice=divePlanner.choose(seed,target,[0,.08,.16],p.launchSurface,true);
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
 if(p.ground===surfaces[2])return {x:clamp((MAP.goalX+3-p.x)*2,-1,1),z:clamp(-p.z*2,-1,1),jump:false};
 if(!p.ground){
   if(p.launchSurface?.type==='bounce'&&!p.plan.length){p.noRoute=(p.noRoute||0)+dt;if(p.noRoute>2){p.giveUp=true;return {x:1,z:0,jump:false};}}
   return p.plan[0]?aiAirInput(p,p.plan[0],dt):{x:0,z:0,jump:false};
 }
 p.think-=dt;
 if(p.think<=0||!p.plan.length){p.plan=route(p.ground,p);p.think=.6;}
 let target=p.plan[0];if(target===p.ground){p.plan.shift();target=p.plan[0];}
 if(!target){
   p.noRoute=(p.noRoute||0)+dt;
   if(p.noRoute>2){p.giveUp=true;$('aiNote').textContent=p.name+' 找不到通往終點的可行路線，決定跳下雲海。';return {x:1,z:0,jump:false};}
   return {x:0,z:0,jump:false};
 }
 p.noRoute=0;
 if(!canJump(p.ground,target)){
   const link=divePlanner.link(p.ground,target,expert||p.i===localId()?7:6.4);
   if(link)return aiLongJump(p,target,link);
 }
 const te=ext(target),ce=ext(p.ground);
 let tx=clamp(p.x,target.x-te.x+.6,target.x+te.x-.6),tz=clamp(p.z,target.z-te.z+.6,target.z+te.z-.6);
 let dx=tx-p.x,dz=tz-p.z,len=Math.hypot(dx,dz);
 if(len<.2){dx=target.x-p.x;dz=target.z-p.z;len=Math.hypot(dx,dz);}
 const edge=Math.min(Math.abs(dx)>.1?(ce.x-Math.sign(dx)*(p.x-p.ground.x))/Math.max(.01,Math.abs(dx)/(len||1)):99,
   Math.abs(dz)>.1?(ce.z-Math.sign(dz)*(p.z-p.ground.z))/Math.max(.01,Math.abs(dz)/(len||1)):99);
 if(expert&&target.type==='fire'&&activeFire(target)&&edge<1.3)return {x:0,z:0,jump:false};
 const nearHazard=surfaces.some(s=>['field','fire','cannon'].includes(s.type)&&Math.hypot(s.x-p.x,s.z-p.z)<4);
 return {x:dx/(len||1),z:dz/(len||1),jump:p.jumpCD<=0&&(edge<.85||(walkY(target)>p.y+.35&&len<1.2)||(expert&&nearHazard))};
}
function die(p,why){if(!p.alive||p.finished)return;releasePlayerGrabs(p);p.alive=false;p.mesh.visible=false;if(p.i===localId()){$('status').textContent=why+' · 觀戰中，下一回合再來！';beep(150,.3);}scores();}
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
function startDive(p){
 if(!p.alive||p.finished||isDown(p)||isDiving(p)||p.diveUsed||p.pendingKnockdown||p.grabbedBy!==null)return false;
 const fromGround=!!p.ground;
 if(p.grabbing!==null)releaseGrab(p,players,'break');
 p.grabIntent=false;p.grabVisualTarget=null;p.grabNeedsRelease=false;
 if(p.i===localId())grabHeld=false;
 p.punchTime=-1;p.punchResolved=true;
 p.diving=true;p.diveUsed=true;p.diveYaw=p.facing;
 if(isBot(p)){p.aiDiveCount++;$('aiNote').textContent=p.name+' 確認落點後，使用跳躍接飛撲。';}
 const fx=Math.cos(p.diveYaw),fz=Math.sin(p.diveYaw);
 const forward=clamp(p.vx*fx+p.vz*fz+DIVE.boost,DIVE.minSpeed,DIVE.maxSpeed);
 const side=(-p.vx*fz+p.vz*fx)*.25;
 p.vx=fx*forward-fz*side;p.vz=fz*forward+fx*side;
 // A ground dive has a small launch arc, never the full Space jump.
 if(fromGround){p.launchSurface=p.ground;p.vy=3.5;p.ground=null;p.jumpCD=Math.max(p.jumpCD,.2);}
 else p.vy=Math.min(p.vy+1.5,3.5);
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
function move(p,dt,input){
 p.jumpCD-=dt;
 const shiftAction=p.shiftAction;p.shiftAction=false;
 const wantsJump=input.jump;
 if(shiftAction)startDive(p);
 updateDive(p,dt);
 recordGrabInput(p,input);
 // A recovering character that loses support returns to physics immediately.
 if(p.getUpTime>0&&!p.ground&&!p.ragdoll?.active)knockDown(p);
 if(p.ragdoll?.active&&p.downTime<=0){
   // Don't stand through a low ceiling or teleport onto an overhead platform.
   let spot=null;
   for(const radius of p.ground&&p.recoverySupportTime>=.12?[0,.45,.85]:[]){
     for(let i=0;i<(radius?8:1);i++){
       const x=p.x+Math.cos(i*Math.PI/4)*radius,z=p.z+Math.sin(i*Math.PI/4)*radius;
       let floor=-Infinity;
       for(const surface of surfaces){const support=supportAt(surface,x,z);if(support?.normal.y>=.5&&support.height<=p.y+.4&&support.height>floor)floor=support.height;}
       if(!Number.isFinite(floor))continue;
       const bottom=new T.Vector3(x,floor+.362,z),top=new T.Vector3(x,floor+1.092,z);
       if(!collisionWorld.capsule(bottom,top,.36).length){spot={x,y:floor+.002,z};break;}
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
   p.vx=T.MathUtils.damp(p.vx,input.x*speed,MOTION.groundResponse,dt);
   p.vz=T.MathUtils.damp(p.vz,input.z*speed,MOTION.groundResponse,dt);
 }else if(mobility>0&&Math.hypot(input.x,input.z)>.01){
   // Air input nudges velocity instead of replacing the takeoff momentum.
   // Releasing direction coasts; turning the body never rotates this velocity.
   const dx=input.x*speed-p.vx,dz=input.z*speed-p.vz,length=Math.hypot(dx,dz);
   const fraction=Math.min(1,MOTION.airAcceleration*mobility*dt/(length||1));
   p.vx+=dx*fraction;p.vz+=dz*fraction;
 }
 if(wantsJump&&p.ground&&p.jumpCD<=0&&!isDown(p)&&!isDiving(p)&&!p.pendingKnockdown&&p.grabbedBy===null){
   p.vy=9.8;p.launchSurface=p.ground;p.ground=null;p.jumpCD=.32;if(p.i===localId())beep(480,.06);
 }
 const from=new T.Vector3(p.x,p.y,p.z),wasGrounded=!!p.ground;
 p.vy-=22*dt;p.x+=(p.vx+p.grabVelocityX)*dt;p.z+=(p.vz+p.grabVelocityZ)*dt;integrateImpulse(p,dt);p.y+=p.vy*dt;
 const fallSpeed=-p.vy;
 p.ground=collisionWorld.movePlayer(p,from,new T.Vector3(p.x,p.y,p.z));
 if(p.ground){
   const surface=p.ground;p.landingSpeed=wasGrounded?0:fallSpeed;
   p.aiDivePlan=null;
   if(p.diving){p.diving=false;p.diveRecovery=DIVE.recoverySeconds;}
   if((p.pendingKnockdown||p.landingSpeed>16)&&!isDown(p)){
     knockDown(p);
     beginRagdoll(p);
     if(p.grabbing!==null)releaseGrab(p,players,'break');
     if(p.i===localId())$('status').textContent='倒地了，稍等一下就會起身。';
   }
   if(surface.type==='bounce'&&p.jumpCD<=0&&!isDown(p)){
     // Landing is consumed before the trampoline clears ground. Air steering now aims at the NEXT surface.
     if(isBot(p)){p.plan=route(surface,p);p.think=.6;if(p.plan.length)p.noRoute=0;}
     p.launchSurface=surface;p.vy=14;p.jumpCD=.5;p.ground=null;
   }
 }
 }
 p.airTime=p.ground?0:(p.airTime||0)+dt;
 if(p.y<-9||Math.abs(p.z)>MAP.halfWidth+10){die(p,'掉進雲海了');return;}
 for(const surface of surfaces){
   const l=local(surface,p),fx=Math.cos(surface.angle),fz=-Math.sin(surface.angle);
   if(surface.type==='spike'&&Math.abs(l.x)<1.12&&Math.abs(l.z)<.5&&p.y<surface.y+1.1&&p.y+1.4>surface.y+.15)
     hitHazard(p,p.x-surface.x,p.z-surface.z,8,5.8,'被尖刺彈飛');
   if(surface.type==='fire'&&activeFire(surface)&&l.x>.4&&l.x<6&&Math.abs(l.z)<.7&&p.y<surface.y+1.5&&p.y+1.3>surface.y+.3)
     hitHazard(p,fx,fz,9,6,'被火焰吹飛');
   if(surface.type==='fan'&&l.x>.5&&l.x<8&&Math.abs(l.z)<1.7&&p.y<surface.y+3&&p.y>surface.y-.6){
     const f=(1-l.x/10)*16;p.impulseX+=fx*f*dt;p.impulseZ+=fz*f*dt;
   }
 }
 for(const shot of shots)if(!shot.spent&&Math.hypot(shot.mesh.position.x-p.x,shot.mesh.position.z-p.z)<.65&&Math.abs(shot.mesh.position.y-(p.y+.8))<.8){
   hitHazard(p,shot.dx,shot.dz,10,6.5,'被砲彈擊飛');shot.spent=true;shot.mesh.visible=false;
 }
 for(const wave of waves){
   wave.hitPlayers??=new Set();
   const r=Math.hypot(p.x-wave.x,p.z-wave.z);
   if(!wave.hitPlayers.has(p.i)&&Math.abs(r-wave.r)<.32&&p.y<wave.y+.5&&p.y+1.4>wave.y-.1){
     hitHazard(p,p.x-wave.x,p.z-wave.z,9,5.5,'被力場波紋彈飛');wave.hitPlayers.add(p.i);
   }
 }
 if(p.alive&&!isDown(p)&&p.x>MAP.goalX+1&&Math.abs(p.z)<4&&p.y>MAP.goalY-.2&&p.y<MAP.goalY+3){
   releasePlayerGrabs(p);p.finished=true;finishOrder.push(p.i);p.mesh.visible=false;
   if(p.i===localId()){$('status').textContent='抵達終點！漂亮，等待其他玩家。';beep(1200,.25);}scores();
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
function traps(dt){for(let s of surfaces){if(s.type==='rotate'){s.mesh.rotation.x=Math.sin((raceTime+s.offset)*.85)*1.45;updateSolidBounds(s);}if(s.type==='fire'){s.mesh.userData.flame.visible=activeFire(s);s.mesh.userData.base.material.emissive.setHex((raceTime+s.offset)%4.5>1.5?0x69331c:0);}if(s.type==='fan')s.mesh.userData.blades.rotation.x+=dt*16;if(s.type==='cannon'&&raceTime-s.lastShot>2.5){s.lastShot=raceTime;let m=sphere(.3,0x303f41,world);m.position.set(s.x+Math.cos(s.angle),s.y+.8,s.z-Math.sin(s.angle));shots.push({mesh:m,dx:Math.cos(s.angle)*10,dz:-Math.sin(s.angle)*10,age:0});}if(s.type==='field'&&raceTime-s.lastWave>4.2){s.lastWave=raceTime;let mesh=new T.Mesh(new T.TorusGeometry(1,.09,6,80),mat(0xb4a0ff,{emissive:0x8d68ff,emissiveIntensity:1}));mesh.rotation.x=Math.PI/2;mesh.position.set(s.x,s.y+.35,s.z);world.add(mesh);waves.push({mesh,x:s.x,z:s.z,y:s.y+.35,r:.2});}}
 shots=shots.filter(b=>{b.age+=dt;b.mesh.position.x+=b.dx*dt;b.mesh.position.z+=b.dz*dt;let blocked=surfaces.some(s=>s.y>b.mesh.position.y&&contains(s,b.mesh.position.x,b.mesh.position.z));if(b.age>6||blocked||b.spent){world.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();return false;}return true;});waves=waves.filter(w=>{w.r+=dt*3.2;w.mesh.scale.set(w.r,w.r,w.r);w.mesh.material.transparent=true;w.mesh.material.opacity=1-w.r/9;if(w.r>8){world.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();return false;}return true;});}
function endRound(){grabHeld=false;clearGrabs(players);players.forEach(p=>{p.delta=p.finished?(finishOrder.length===players.length?1:3+(finishOrder[0]===p.i?1:0)):0;p.score+=p.delta;});setPhase('results',0,'回合結算','好路線還是壞心眼？下回合繼續加料。');show('results',true);let ranked=[...players].sort((a,b)=>b.score-a.score);$('resultEyebrow').textContent=round===8?'PARTY COMPLETE':'ROUND COMPLETE';$('resultTitle').textContent=round===8?ranked[0].name+' 贏得這場派對！':finishOrder.length?'有人成功突破工地！':'這條路，還需要一點創意。';$('resultNote').textContent=finishOrder.length+' / '+players.length+' 人抵達。'+(round===8?'這局已結束，可以再開一場。':'已放物件會保留。下一回合繼續搭路與設陷阱。');$('resultRows').innerHTML=ranked.map((p,i)=>`<div class="resultrow"><span>${String(i+1).padStart(2,'0')}</span><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${html(p.name)}<small>${p.finished?'抵達':'未抵達'}</small><b>${p.score} <small>+${p.delta}</small></b></div>`).join('');$('next').textContent=round===8?'再開一場 ↗':'下一回合 →';scores();}
function toLobby(){practiceMode=false;phase='lobby';unlockMouse();for(let id of ['hud','draft','buildTools','results'])show(id,false);show('lobby',true);show('previewNote',true);clean();makeMap();addSurface('platform',10,0);addSurface('bounce',15,1);addSurface('rotate',30,-1);addSurface('fan',36,2);addSurface('platform',40,0);resetPlayers(8);players.forEach((p,i)=>{p.x=i<4?i*1.2-2:21+(i-5);p.z=(i%3)*1.5-2;p.mesh.position.set(p.x,0,p.z);});}
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
function practice(){
 if(net?.online)net.leave();
 start();practiceMode=true;show('draft',false);show('buildTools',false);
 setPhase('race',999,'拳擊練習場','Shift 單擊飛撲 · 左鍵出拳 · 右鍵抓人');
 spawn();yaw=0;pitch=-.1;raceTime=0;
 players.forEach((p,i)=>{p.x=i===0?-1:1.1+Math.floor((i-1)/3)*2;p.z=i===0?0:((i-1)%3-1)*2;p.facing=i?Math.atan2(-p.z,-1-p.x):0;p.mesh.rotation.y=-p.facing;p.mesh.position.set(p.x,p.y,p.z);});
 $('controls').textContent='滑鼠轉視角 · WASD 移動 · Space 跳躍／掙脫 · Shift 飛撲 · 左鍵拳 · 右鍵抓';
 $('aiNote').textContent='練習場：AI 會還手、抓人與掙脫。右下方可體驗擊飛、倒地與自動起身。';
}
function testImpact(){
 if(practiceMode&&phase==='race'&&localPlayer().alive)hitHazard(localPlayer(),1,0,6,6,'被測試衝擊擊飛');
}
function showAIDiveDemo(){
 $('help').close?.();practice();
 const target=addSurface('platform',17,0,0,0,8,12,true);
 players.forEach((p,i)=>{
   p.x=i===0?4:i===1?2:-3-Math.floor(i/3);p.z=i===0?3.5:i===1?0:(i%3-1)*3;
   p.facing=0;p.mesh.rotation.y=0;p.mesh.position.set(p.x,p.y,p.z);
 });
 players[1].demoTarget=target;players[1].plan=[target];players[1].think=0;
 yaw=-.15;pitch=-.25;
 $('phaseLabel').textContent='AI 跳撲示範';
 $('phaseHint').textContent='6 公尺缺口 · 助跑 → 起跳 → 判斷落點 → 飛撲煞停';
}
function testRagdoll(){
 if(!practiceMode||phase!=='race'||isDown(localPlayer()))return;
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
 keys={};if(localPlayer())localPlayer().shiftAction=false;orbitDrag=null;stopGrabInput();
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

window.addEventListener('keydown',e=>{if(e.code==='Escape'){unlockMouse();return;}if($('help').open)return;if(['Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();const wasShift=keys.ShiftLeft||keys.ShiftRight;keys[e.code]=true;if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat&&!wasShift&&phase==='race'){if(net?.isGuest)net.action('dive');else localPlayer().shiftAction=true;}if(e.code==='Space'&&!e.repeat&&phase==='race'){if(net?.isGuest)net.action('jump');else strugglePulse(localPlayer());}if(e.code==='Enter'&&phase==='build')placeHuman();if(e.code==='KeyR'&&!e.repeat&&phase==='build'&&!placed){rotatePlacement();}});window.addEventListener('keyup',e=>keys[e.code]=false);window.addEventListener('blur',unlockMouse);
$('grabPracticeDemo').onclick=showGrabPractice;$('aiDiveDemo').onclick=showAIDiveDemo;$('testRagdoll').onclick=testRagdoll;$('testImpact').onclick=testImpact;$('practice').onclick=practice;$('start').onclick=start;$('quit').onclick=()=>net?.online?net.leave():toLobby();$('next').onclick=()=>{if(net?.online){if(!net.isHost)return;if(round===8){net.send({type:'lobby'});return;}}round===8?start():beginRound();};$('rotate').onclick=()=>{if(!placed){placementYaw+=Math.PI/2;updateGhost();}};$('ready').onclick=placeHuman;$('autoPlace').onclick=()=>{if(!placed){aim=suggest(localPlayer().pick);$('height').value=''+aim.y;updateGhost();}};$('helpBtn').onclick=()=>{$('help').showModal();unlockMouse();};$('closeHelp').onclick=()=>{$('help').close();syncMouseLock();};$('help').addEventListener('close',syncMouseLock);$('soundBtn').onclick=()=>{muted=!muted;$('soundBtn').textContent=muted?'♫':'♪';$('soundBtn').style.background=muted?'':'#d2ff5a';beep();};
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let last=performance.now(),camTarget=new T.Vector3(),desired=new T.Vector3();camera.position.set(15,39,43);
function humanInput(){
 const x=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),z=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),l=Math.hypot(x,z)||1;
 return {x:(x*Math.cos(yaw)-z*Math.sin(yaw))/l,z:(x*Math.sin(yaw)+z*Math.cos(yaw))/l,jump:!!keys.Space};
}
function raceInput(p,dt){
 let input;
 if(p.i===localId())input=humanInput();
 else if(net?.isHost&&!isBot(p)){
   const remote=net.inputs.get(p.i),fresh=remote&&performance.now()-remote.received<500;
   input=fresh?{x:remote.x,z:remote.z,jump:remote.jump}:{x:0,z:0,jump:false};
   p.netActions??={jump:0,dive:0,punch:0};
   if(fresh){for(const key of ['jump','dive','punch']){const serial=remote.actions[key]||0;if(serial>p.netActions[key]){if(key==='jump')strugglePulse(p);if(key==='dive')p.shiftAction=true;if(key==='punch')startPunch(p);p.netActions[key]=serial;}}}
   if(fresh&&remote.grab&&!isDiving(p)){p.grabIntent=!p.grabNeedsRelease;tryGrab(p);}
   else{releaseGrab(p,players);p.grabIntent=false;p.grabNeedsRelease=false;}
 }else input=practiceMode?practiceInput(p,dt):bot(p,dt);
 recordGrabInput(p,input);return input;
}
function tick(now,networkClock=false){if(!networkClock)requestAnimationFrame(tick);if(net?.isHost&&net.running&&!networkClock)return;if(networkClock&&!(net?.isHost&&net.running))return;let dt=Math.min((now-last)/1000,.033);last=now;time+=dt;if(net?.isGuest&&net.running){guestFrame(dt);renderFrame(dt);return;}if(phase==='draft'){remaining-=dt;draftElapsed+=dt;let p=players.filter(isBot).find(p=>!p.pick&&draftElapsed>1.8+p.i*.55+((round+p.i)%3)*.2);if(p)aiPick(p);if(remaining<=0){for(let p of players)if(!p.pick)aiPick(p);}}else if(phase==='build'){remaining-=dt;buildElapsed+=dt;updateBuildAim(dt);let p=players.filter(isBot).find(p=>!p.built&&buildElapsed>1+p.i*.8);if(p)aiBuild(p);if(remaining<=0)beginRace();}else if(phase==='race'){remaining-=dt;raceTime+=dt;traps(dt);if(grabHeld){localPlayer().grabIntent=!localPlayer().grabNeedsRelease;tryGrab(localPlayer());}const raceInputs=new Map();for(const p of players)if(p.alive&&!p.finished)raceInputs.set(p,raceInput(p,dt));updateGrabs(players,dt,punchBlocked,(p,holder)=>{if(p.i===localId())$('status').textContent='掙脫成功！';else if(holder.i===localId())$('status').textContent=p.name+' 掙脫了！放開右鍵後可再次抓取。';});for(let p of players){if(!p.alive||p.finished)continue;move(p,dt,raceInputs.get(p));if(isBot(p))aiPunch(p);}
 resolvePlayerContacts(players,dt);for(const p of players)if(p.alive&&!p.finished&&!p.ragdoll?.active)collisionWorld.depenetrate(p);updateCombat(players,dt,punchHit,punchBlocked);
 for(const p of players){if(p.alive&&!p.finished){p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=-p.facing;animateAnimal(p,dt);}
   else if(practiceMode){releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{alive:true,finished:false,x:p.i===localId()?-1:2+Math.floor(p.i/3)*1.4,z:p.i===localId()?0:(p.i%3-1)*2,y:0,vx:0,vz:0,vy:0,ground:surfaces[0]});}
 }
 impacts=impacts.filter(e=>{e.age+=dt;e.mesh.position.y+=dt*1.2;e.mesh.material.opacity=Math.max(0,1-e.age/.45);if(e.age>.45){world.remove(e.mesh);e.mesh.material.map.dispose();e.mesh.material.dispose();return false;}return true;});
 updateCombatHUD();
 if(!practiceMode&&(remaining<=0||players.every(p=>!p.alive||p.finished)))endRound();}
 renderFrame(dt);if(net?.isHost&&net.running)net.snapshot(networkSnapshot());
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
 $('testRagdoll').hidden=!practiceMode||phase!=='race';$('testImpact').hidden=!practiceMode||phase!=='race';if(phase!=='race')$('combatHint').hidden=true;
 if(phase==='lobby'){for(let p of players){animateAnimal(p,dt,true);p.mesh.position.y=Math.sin(time*2+p.i)*.06;p.mesh.rotation.y=Math.sin(time*.3+p.i)*.2;}surfaces.forEach(s=>{if(s.type==='rotate'){s.mesh.rotation.x=Math.sin(time)*.6;updateSolidBounds(s);}if(s.type==='fan')s.mesh.userData.blades.rotation.x+=dt*10;});}
 $('clock').textContent=practiceMode?'∞':Math.max(0,Math.ceil(remaining));let targetX=54,targetZ=0;if(phase==='race'||phase==='build'){let focus=phase==='build'?aim:(localPlayer().alive&&!localPlayer().finished?localPlayer():players.filter(p=>p.alive&&!p.finished).sort((a,b)=>b.x-a.x)[0]);if(focus){let a=phase==='build'?buildView.yaw:focus.i===localId()?yaw:Math.atan2(focus.vz,focus.vx),b=phase==='build'?buildView.pitch:focus.i===localId()?pitch:-.32;let distance=phase==='build'?10:7;desired.set(focus.x-Math.cos(a)*Math.cos(b)*distance,focus.y+2-Math.sin(b)*distance,focus.z-Math.sin(a)*Math.cos(b)*distance);for(let s of surfaces)if(contains(s,desired.x,desired.z)&&desired.y<s.y+1)desired.y=s.y+1;camera.position.lerp(desired,1-Math.exp(-dt*12));camera.lookAt(focus.x,focus.y+1.2,focus.z);}players.forEach(p=>p.mesh.visible=p.alive&&!p.finished);$('crosshair').hidden=phase!=='build';}else{players.forEach(p=>p.mesh.visible=p.alive&&!p.finished);$('crosshair').hidden=true;const fit=Math.max(1,1.65/camera.aspect);desired.set(89,100*fit,135*fit);camTarget.set(108,12,0);camera.position.lerp(desired,1-Math.exp(-dt*3));camera.lookAt(camTarget);}renderer.render(scene,camera);}
const NETWORK_FIELDS=['x','y','z','vx','vy','vz','facing','alive','finished','score','delta','pick','built','punchCooldown','punchTime','punchSerial','hitSerial','hitFlash','lastImpactX','lastImpactZ','landingSpeed','downTime','getUpTime','pendingKnockdown','diving','diveRecovery','divePose','diveYaw','grabbedBy','grabbing','grabNeedsRelease','escapeProgress','grabFacingLocked','grabIntent','grabYaw','grabVelocityX','grabVelocityZ'];
const rounded=n=>Math.round(n*10000)/10000;
const poseOf=o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].map(rounded);
function networkSnapshot(){
 return {phase,round,remaining,raceTime,expert,selection,finishOrder,
  title:$('phaseLabel').textContent,hint:$('phaseHint').textContent,
  result:{title:$('resultTitle').textContent,note:$('resultNote').textContent},
  surfaces:surfaces.map(s=>({id:s.id,type:s.type,x:s.x,y:s.y,z:s.z,angle:s.angle,w:s.designWidth,d:s.designDepth,fixed:s.fixed,offset:s.offset})),
  players:players.map(p=>{const data={i:p.i,ground:p.ground?.id??null};for(const key of NETWORK_FIELDS)data[key]=p[key];const rig=p.mesh.userData.animal;
   data.pose={pivot:poseOf(rig.bodyPivot),bones:[...rig.bones.values()].map(b=>[...b.position.toArray(),...b.quaternion.toArray()].map(rounded)),label:p.mesh.userData.nameLabel.position.y};
   return data;
  }),
  shots:shots.map(b=>({x:b.mesh.position.x,y:b.mesh.position.y,z:b.mesh.position.z})),
  waves:waves.map(w=>({x:w.x,y:w.y,z:w.z,r:w.r}))};
}
function applyRoomRoster(){
 if(!net?.room)return;
 for(const p of players){const seat=net.room.members[p.i];if(!seat)continue;
  if(p.human!==seat.human){releasePlayerGrabs(p);p.think=0;p.plan=[];p.netActions={jump:0,dive:0,punch:0};}
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
 unlockMouse();networkMatch=room.match;networkFrameAt=0;placementPending=false;practiceMode=false;
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
  if(!legal(a,p.pick,m.angle)){net.send({type:'notice',slot:m.slot,message:'該位置剛被其他玩家放置，請換一個位置。'});return;}
  addSurface(p.pick,a.x,a.z,a.y,m.angle);p.built=true;
 }
}
let draftSignature='';
function receiveNetworkState(s){
 if(!net?.isGuest||s.match!==networkMatch||s.seq<=networkFrameAt)return;
 networkFrameAt=s.seq;
 const changed=s.phase!==phase||s.round!==round;
 remaining=s.remaining;raceTime=s.raceTime;expert=s.expert;round=s.round;finishOrder=s.finishOrder;
 for(const spec of s.surfaces){
  let surface=surfaces[spec.id];if(!surface)surface=addSurface(spec.type,spec.x,spec.z,spec.y,spec.angle,spec.w,spec.d,spec.fixed);
  surface.offset=spec.offset;
 }
 for(const data of s.players){const p=players[data.i];if(!p)continue;
  for(const key of NETWORK_FIELDS)if(data[key]!==undefined)p[key]=data[key];
  p.ground=data.ground===null?null:surfaces[data.ground];p.remotePose=data.pose;
  if(changed){p.mesh.position.set(p.x,p.y,p.z);p.mesh.rotation.y=-p.facing;}
 }
 const picked=JSON.stringify(s.selection)+localPlayer().pick;selection=s.selection;
 if(changed){
  setPhase(s.phase,remaining,s.title,s.hint);placementPending=false;clearMouseInput();
  show('draft',phase==='draft');show('buildTools',phase==='build');show('results',phase==='results');
  if(ghost){world.remove(ghost);ghost=null;}
  if(phase==='build'){
   placed=!!localPlayer().built;placementYaw=0;buildView.yaw=0;buildView.pitch=-.5;
   $('pickedName').textContent=info(localPlayer().pick)[2];aim=suggest(localPlayer().pick);if(!placed){makeGhost();updateGhost();}
   $('controls').textContent='滑鼠轉鏡頭 · WASD 移動 · Space ↑ Ctrl ↓ · R 轉物件 · Enter 放置';
  }else if(phase==='race'){
   yaw=0;pitch=-.06;grabHeld=false;
   $('controls').textContent='滑鼠轉視角 · WASD 移動 · Space 跳躍／掙脫 · Shift 飛撲 · 左鍵拳 · 右鍵抓';
  }else if(phase==='draft')$('controls').textContent='點擊搶物件 · 每人一件 · 先搶先得';
  if(phase==='results'){
   $('resultEyebrow').textContent=round===8?'PARTY COMPLETE':'ROUND COMPLETE';
   $('resultTitle').textContent=s.result.title;$('resultNote').textContent=s.result.note;
   $('resultRows').innerHTML=[...players].sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="resultrow"><span>${i+1}</span><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${html(p.name)}<small>${p.finished?'抵達':'未抵達'}</small><b>${p.score} <small>+${p.delta}</small></b></div>`).join('');
   $('next').disabled=true;$('next').textContent=round===8?'等待房主返回房間':'等待房主開始下一回合';
  }
  $('aiNote').textContent='真人同步連線中 · 空位與離線玩家由 AI 接手。';
 }
 if(phase==='draft'&&(changed||picked!==draftSignature)){renderDraft();draftSignature=picked;}
 if(phase==='build'){
  placed=!!localPlayer().built;if(placed){if(placementPending)$('status').textContent='已放置！等待其他玩家，準備出發。';placementPending=false;if(ghost){world.remove(ghost);ghost=null;}}
  $('ready').disabled=placed||placementPending;$('ready').textContent=placed?'已放置 ✓':placementPending?'確認中…':'確認放置 ✓';
 }
 syncRemoteEffects(s);scores();
}
function syncRemoteEffects(s){
 while(shots.length>s.shots.length){const b=shots.pop();world.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();}
 s.shots.forEach((b,i)=>{shots[i]??={mesh:sphere(.3,0x303f41,world)};shots[i].mesh.position.set(b.x,b.y,b.z);});
 while(waves.length>s.waves.length){const w=waves.pop();world.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();}
 s.waves.forEach((w,i)=>{if(!waves[i]){const mesh=new T.Mesh(new T.TorusGeometry(1,.09,6,80),mat(0xb4a0ff,{emissive:0x8d68ff,emissiveIntensity:1,transparent:true}));mesh.rotation.x=Math.PI/2;world.add(mesh);waves[i]={mesh};}waves[i].mesh.position.set(w.x,w.y,w.z);waves[i].mesh.scale.setScalar(w.r);waves[i].mesh.material.opacity=1-w.r/9;});
}
const remotePoint=new T.Vector3(),remoteQuaternion=new T.Quaternion();
function guestFrame(dt){
 if(phase==='build')updateBuildAim(dt);
 if(phase==='race'){
  net.input({...humanInput(),grab:grabHeld});updateCombatHUD();
  if(performance.now()-net.lastReceive>3000)$('status').textContent='等待房主同步…';
 }
 const blend=1-Math.exp(-dt*25);
 for(const p of players){
  const pose=p.remotePose;if(!pose)continue;
  p.mesh.position.lerp(remotePoint.set(p.x,p.y,p.z),blend);
  remoteQuaternion.setFromAxisAngle(new T.Vector3(0,1,0),-p.facing);p.mesh.quaternion.slerp(remoteQuaternion,blend);
  const rig=p.mesh.userData.animal,v=pose.pivot;
  rig.bodyPivot.position.lerp(remotePoint.fromArray(v),blend);rig.bodyPivot.quaternion.slerp(remoteQuaternion.fromArray(v,3),blend);rig.bodyPivot.scale.fromArray(v,7);
  let j=0;for(const bone of rig.bones.values()){const b=pose.bones[j++];if(!b)continue;bone.position.lerp(remotePoint.fromArray(b),blend);bone.quaternion.slerp(remoteQuaternion.fromArray(b,3),blend).normalize();}
  rig.grabRing.visible=p.grabbedBy!==null;rig.grabRing.material.color.setHex(p.escapeProgress>.6?0xffffff:0xffb765);
  p.mesh.userData.nameLabel.position.y=pose.label;p.mesh.updateMatrixWorld(true);
  if(isDown(p))for(const side of ['L','R']){const foot=rig.bones.get('Foot'+side),shin=rig.bones.get('LowerLeg'+side);foot.position.copy(foot.parent.worldToLocal(shin.localToWorld(rig.feet.get(side).ankle.clone())));}
 }
 for(const s of surfaces){
  if(s.type==='rotate')s.mesh.rotation.x=Math.sin((raceTime+s.offset)*.85)*1.45;
  if(s.type==='fire'){s.mesh.userData.flame.visible=activeFire(s);s.mesh.userData.base.material.emissive.setHex((raceTime+s.offset)%4.5>1.5?0x69331c:0);}
  if(s.type==='fan')s.mesh.userData.blades.rotation.x+=dt*16;
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
window.partyDebug={get state(){return {phase,round,remaining,surfaces:surfaces.length,players:players.map(p=>({name:p.name,x:p.x,y:p.y,z:p.z,alive:p.alive,finished:p.finished,score:p.score}))};}};
