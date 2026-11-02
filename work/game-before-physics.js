import * as T from './three.module.js';
import { loadCharacters, createAnimal, animateAnimal, resetAnimal } from './characters.js';
import { COMBAT, resetCombat, startPunch, updateCombat, integrateImpulse, resolvePlayerContacts, isDown, knockDown, hazardImpact, startGrab, releaseGrab, clearGrabs, updateGrabs, strugglePulse } from './combat.js';
const $=id=>document.getElementById(id), clamp=T.MathUtils.clamp;
const TYPES=[['platform','▰','雲朵平台','穩穩站好，搭出一條生路',0xa9d879],['rotate','◈','旋轉方塊','傾角超過 60° 會滑落',0xb09ee8],['bounce','↟','彈跳床','跳得更高，也可能飛太遠',0xf2c957],['fire','♨','噴火器','週期噴火，先看預告',0xf18d62],['spike','▲','尖刺','碰到會彈飛，落地暫時倒地',0xe888a7],['cannon','●','砲台','自動發射擊飛砲彈',0x7e9baa],['fan','✳','電風扇','順風起飛，逆風小心',0x77d3d2],['field','◎','波紋力場','水平波紋會把角色擊飛',0x9ca5ee]];
const MAP={goalX:216,goalY:24,buildMaxX:207,halfWidth:48,maxBuildY:40,raceSeconds:105};
const info=t=>TYPES.find(v=>v[0]===t), colors=[0xf58055,0xa494eb,0x76c6bc,0xe2bd54,0xe58fb0,0x7eb478,0x6eacd7,0xc0b08c,0xb57aaf,0x9abac6];
let scene=new T.Scene();scene.background=new T.Color('#cce6e4');scene.fog=new T.Fog('#cce6e4',190,550);
let camera=new T.PerspectiveCamera(44,innerWidth/innerHeight,.1,700), renderer;
try{renderer=new T.WebGLRenderer({antialias:true});}catch(e){$('loading').textContent='無法啟動 WebGL，請開啟瀏覽器硬體加速後重新整理。';throw e;}
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;$('game').appendChild(renderer.domElement);
scene.add(new T.HemisphereLight(0xffffff,0x789b87,2.5));const sun=new T.DirectionalLight(0xfff6dd,3);sun.position.set(15,35,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:30,bottom:-30,near:1,far:100});sun.shadow.bias=-.0004;scene.add(sun);
const world=new T.Group();scene.add(world);const decor=new T.Group();scene.add(decor);
const mat=(c,extra={})=>new T.MeshStandardMaterial({color:c,roughness:.73,...extra});
function box(w,h,d,c,parent=world){let m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function sphere(r,c,parent){let m=new T.Mesh(new T.SphereGeometry(r,16,12),mat(c));parent.add(m);m.castShadow=true;return m;}
function cyl(r,h,c,parent){let m=new T.Mesh(new T.CylinderGeometry(r,r,h,18),mat(c));parent.add(m);m.castShadow=true;return m;}
function label(text,color='#203b30'){const c=document.createElement('canvas');c.width=512;c.height=128;let ctx=c.getContext('2d');ctx.fillStyle=color;ctx.font='bold 48px Arial';ctx.textAlign='center';ctx.fillText(text,256,78);let s=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));s.scale.set(4,1,1);return s;}
for(let i=0;i<28;i++){let c=new T.Group();let x=Math.sin(i*321.7)*135,z=Math.cos(i*113.1)*70;c.position.set(x+108,-7-Math.random()*9,z);for(let j=0;j<3;j++){let p=sphere(2+Math.random()*2,0xe6f4eb,c);p.scale.y=.35;p.position.x=j*2;}decor.add(c);}
const ring=new T.Mesh(new T.TorusGeometry(5,.08,8,80),mat(0xe4eee1));ring.rotation.x=Math.PI/2;ring.position.set(48,-1,0);decor.add(ring);
let surfaces=[],players=[],shots=[],waves=[],phase='lobby',remaining=0,round=0,time=0,raceTime=0,expert=true,selection=[],draftElapsed=0,buildElapsed=0,placed=false,placementYaw=0,ghost=null,aim={x:10,z:0,y:0},keys={},finishOrder=[],firstAwarded=false,muted=true,audio,yaw=0,pitch=-.32;
const buildView={yaw:0,pitch:-.5};
let practiceMode=false, impacts=[], grabHeld=false;
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
function clean(){grabHeld=false;clearGrabs(players);for(const p of players)p.mesh.userData.dispose?.();impacts=[];for(const s of [...shots,...waves]){world.remove(s.mesh);}shots=[];waves=[];while(world.children.length){const o=world.children[0];world.remove(o);o.traverse(v=>{v.geometry?.dispose();if(v.material){for(const m of Array.isArray(v.material)?v.material:[v.material]){m.map?.dispose();m.dispose();}}});}surfaces=[];players=[];ghost=null;}

function makeMap(){
 addSurface('platform',0,0,0,0,14,18,true);
 addSurface('platform',108,0,12,0,14,20,true);
 addSurface('platform',MAP.goalX,0,MAP.goalY,0,18,24,true);
 for(const [x,z] of [[27,-6],[54,8],[81,-6],[135,6],[162,-8],[189,6]])addSurface('platform',x,z,x/9,0,12,20,true);
 for(const s of surfaces){const slab=box(s.w*.8,4,s.d*.8,0x78aaa1);slab.position.set(s.x,s.y-2.5,s.z);}
 const gate=new T.Group();
 for(const z of [-4,4]){const p=box(.4,6,.4,0x325d4d,gate);p.position.set(0,3,z);}
 const top=box(.4,.7,8.4,0xc9f96a,gate);top.position.y=5.7;
 const finish=label('FINISH');finish.position.set(0,5.7,0);gate.add(finish);
 gate.position.set(MAP.goalX+2,MAP.goalY,0);world.add(gate);
 for(const z of [-6,6]){const p=box(.18,3,.18,0xf9faec);p.position.set(5,1.5,z);const flag=box(1,.7,.06,0xf09369);flag.position.set(5.5,2.6,z);}
 for(const x of [27,54,81,108,135,162,189,216]){const l=label('↑ '+Math.round(x/9)+'m','#648479');l.position.set(x,x/9-5,-16);world.add(l);}
}

function resetPlayers(n){for(let i=0;i<n;i++){let p={i,name:i===0?'你':['Mochi','Nova','Kiwi','Miso','Bolt','Luna','Tofu','Pepper','Bean'][i-1],mesh:character(i),score:0,delta:0,x:0,z:0,y:0,vx:0,vz:0,vy:0,alive:true,finished:false,ground:null,pick:null,plan:[],think:0,jumpCD:0,wait:0,personality:.8+Math.random()*.4};players.push(p);}spawn();}
function spawn(){grabHeld=false;clearGrabs(players);players.forEach((p,i)=>{resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{x:-2+(i%3)*1.1,z:-3+Math.floor(i/3)*1.7,y:.05,vx:0,vz:0,vy:0,alive:true,finished:false,ground:surfaces[0],plan:[],think:0,jumpCD:0,delta:0,noRoute:0,giveUp:false,launchSurface:null});p.mesh.visible=true;p.mesh.position.set(p.x,p.y,p.z);});finishOrder=[];}
function show(id,b){$(id).hidden=!b;}
function scores(){ $('scores').innerHTML=[...players].sort((a,b)=>b.score-a.score).map(p=>`<div class="score ${p.i===0?'me':''}"><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${p.name}<span>${p.finished?'⚑':!p.alive?'×':''}</span><b>${p.score}</b></div>`).join('');}
function setPhase(p,sec,title,hint){phase=p;remaining=sec;$('phaseLabel').textContent=title;$('phaseHint').textContent=hint;$('status').textContent='';$('roundLabel').textContent=`ROUND ${String(round).padStart(2,'0')} / 08`;scores();}
function start(){practiceMode=false;clean();makeMap();expert=$('difficulty').value==='expert';resetPlayers(+$('count').value);round=0;show('lobby',false);show('previewNote',false);show('hud',true);beginRound();}
function beginRound(){round++;spawn();players.forEach(p=>{p.pick=null;p.built=false;});show('results',false);show('buildTools',false);selection=[];let n=players.length;for(let i=0;i<n+2;i++){let t=i<Math.ceil(n*.55)?'platform':TYPES[1+Math.floor(Math.random()*7)][0];selection.push({type:t,owner:null});}selection.sort(()=>Math.random()-.5);draftElapsed=0;setPhase('draft',12,'搶物件','選一件道具。AI 也在等著出手！');show('draft',true);renderDraft();$('controls').textContent='滑鼠點擊搶物件 · 每人一件';$('aiNote').textContent='AI 策略：優先取得平台補路，後續回合增加陷阱。';}
function renderDraft(){$('items').innerHTML=selection.map((s,i)=>{let t=info(s.type);return `<button class="item" data-item="${i}" ${s.owner!==null||players[0].pick?'disabled':''}><span class="glyph" style="color:#${t[4].toString(16)}">${t[1]}</span><strong>${t[2]}</strong><small>${t[3]}</small><span class="owner">${s.owner!==null?players[s.owner].name:''}</span></button>`;}).join('');$('items').querySelectorAll('button').forEach(b=>b.onclick=()=>claim(players[0],+b.dataset.item));}
function claim(p,i){if(phase!=='draft'||p.pick||selection[i]?.owner!==null)return;selection[i].owner=p.i;p.pick=selection[i].type;beep(p.i?300:750);renderDraft();if(players.every(p=>p.pick))beginBuild();}
function aiPick(p){let available=selection.map((s,i)=>({...s,i})).filter(s=>s.owner===null);available.sort((a,b)=>pickValue(b.type,p)-pickValue(a.type,p));if(available[0])claim(p,available[0].i);}
function pickValue(t,p){return (t==='platform'?round<3?8:4:t==='bounce'?5:t==='fan'?3:2)+Math.random()*3;}
function beginBuild(){show('draft',false);setPhase('build',15,'搭出你的勝算','移動滑鼠直接轉鏡頭；按 R 才旋轉物件。綠色可放。');show('buildTools',true);placed=false;placementYaw=0;buildElapsed=0;$('height').value='0';$('pickedName').textContent=info(players[0].pick)[2];$('ready').disabled=false;$('ready').textContent='確認放置 ✓';makeGhost();aim=suggest(players[0].pick);buildView.yaw=0;buildView.pitch=-.5;updateGhost();$('controls').textContent='滑鼠轉鏡頭 · WASD 移動 · Space ↑ Ctrl ↓ · R 轉物件 · Enter 放置';$('aiNote').textContent='AI 正在評估缺口與替代路線，建議位置也可交給 AI。';}
function makeGhost(){if(ghost)world.remove(ghost);ghost=model(players[0].pick);ghost.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.5;o.material.depthWrite=false;}});world.add(ghost);}

function bounds(s){
 if(s.placementBounds)return s.placementBounds;
 const localBox=shapeBounds(s.type,s.type==='platform'?(s.designWidth??s.w):3.6,s.type==='platform'?(s.designDepth??s.d):3.6).clone();
 if(s.type==='rotate'){localBox.min.set(-1.55,-1.85,-1.85);localBox.max.set(1.55,1.85,1.85);}
 const m=new T.Matrix4().compose(new T.Vector3(s.x,s.y,s.z),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),s.angle),new T.Vector3(1,1,1));
 const b=localBox.applyMatrix4(m);
 const result={minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};if(s.mesh)s.placementBounds=result;return result;
}
function legal(a,t=players[0]?.pick){
 if(a.x<7||a.x>MAP.buildMaxX||Math.abs(a.z)>MAP.halfWidth||a.y<-.5||a.y>MAP.maxBuildY)return false;
 const q=bounds({type:t,x:a.x,z:a.z,y:a.y,w:3.6,d:3.6,angle:placementYaw});
 return !surfaces.some(s=>{const r=bounds(s);return q.minX<r.maxX-.02&&q.maxX>r.minX+.02&&q.minY<r.maxY-.02&&q.maxY>r.minY+.02&&q.minZ<r.maxZ-.02&&q.maxZ>r.minZ+.02;});
}

function updateGhost(){if(!ghost)return;$('coords').textContent='X '+aim.x.toFixed(1)+' · Y '+aim.y.toFixed(1)+' · Z '+aim.z.toFixed(1)+' · 物件 '+Math.round(placementYaw*180/Math.PI)+'°';ghost.position.set(aim.x,aim.y,aim.z);ghost.rotation.y=placementYaw;let ok=legal(aim);ghost.traverse(o=>{if(o.material)o.material.color.setHex(ok?0x72d485:0xf06a67);});}
function suggest(type){let reach=new Set([surfaces[0]]),queue=[surfaces[0]];while(queue.length){let s=queue.shift();for(let v of surfaces)if(!reach.has(v)&&v.type!=='spike'&&gap(s,v)<4.1&&walkY(v)-walkY(s)<=1.45&&walkY(s)-walkY(v)<4){reach.add(v);queue.push(v);}}let best=null,bestV=-Infinity;for(let x=10;x<=MAP.buildMaxX;x+=3)for(let z=-18;z<=18;z+=3)for(let dy of [-.5,0,.5]){let a={x,z,y:Math.round((x/9+dy)*2)/2};if(!legal(a,type))continue;let nearest=99,left=false,right=false;for(let s of surfaces){let e=ext(s),g=Math.hypot(Math.max(0,Math.abs(x-s.x)-e.x-1.8),Math.max(0,Math.abs(z-s.z)-e.z-1.8));if(Math.abs(s.y-a.y)<1.5){nearest=Math.min(nearest,g);if(g<3.6&&s.x<x&&reach.has(s)&&a.y-s.y<=1.4)left=true;if(g<4&&s.x>x)right=true;}}if(!left)continue;let value=10+(right?3:0)-Math.abs(nearest-2.4)*.5-Math.abs(z)*.25+x*.35;if(nearest>4.2)value-=40;if(type!=='platform'&&type!=='bounce')value-=Math.abs(z-6)*.2;if(value>bestV){bestV=value;best=a;}}return best||{x:10,z:0,y:2};}
function placeHuman(){if(phase!=='build'||placed)return;if(!legal(aim)){$('status').textContent='這裡會重疊，換個位置或高度。';return;}addSurface(players[0].pick,aim.x,aim.z,aim.y,placementYaw);players[0].built=true;placed=true;world.remove(ghost);ghost=null;$('status').textContent='已放置！等待其他玩家，準備出發。';$('ready').disabled=true;$('ready').textContent='已放置 ✓';beep(850);}
function aiBuild(p){let a=suggest(p.pick);if(!legal(a,p.pick)){p.built=true;return;}addSurface(p.pick,a.x,a.z,a.y,0);p.built=true;}
function beginRace(){if(!placed){if(!legal(aim))aim=suggest(players[0].pick);placeHuman();}for(let p of players.slice(1))if(!p.built)aiBuild(p);if(ghost){world.remove(ghost);ghost=null;}show('buildTools',false);setPhase('race',MAP.raceSeconds,'跑起來！','到達綠色終點門獲得分數。陷阱會擊飛，落地會倒地；掉進雲海才淘汰。');spawn();raceTime=0;yaw=0;pitch=-.06;for(let s of surfaces){s.lastShot=-3;s.lastWave=-3;}$('controls').textContent='移動滑鼠轉視角 · WASD 移動 · Space 跳躍／掙脫 · 左鍵出拳 · 按住右鍵抓人';$('aiNote').textContent='高手 AI：動態尋路 → 評估落點 → 等待陷阱空檔 → 跳躍。';beep(1000,.2);}
function gap(a,b){let ea=ext(a),eb=ext(b);return Math.hypot(Math.max(0,Math.abs(a.x-b.x)-ea.x-eb.x),Math.max(0,Math.abs(a.z-b.z)-ea.z-eb.z));}
function canTraverse(a,b){
 const dy=walkY(b)-walkY(a);
 if(a.type!=='bounce')return gap(a,b)<=4.4&&dy<=1.45&&dy>-4;
 if(dy>3.6||dy<-8)return false;
 const e=ext(b),dx=Math.max(0,Math.abs(a.x-b.x)-Math.max(0,e.x-.55)),dz=Math.max(0,Math.abs(a.z-b.z)-Math.max(0,e.z-.55));
 const flight=(14+Math.sqrt(196-44*dy))/22;
 return Math.hypot(dx,dz)<7*flight-.65;
}
function route(start,p){const goal=surfaces[2],dist=new Map([[start,0]]),prev=new Map(),open=new Set([start]);while(open.size){let u=[...open].sort((a,b)=>dist.get(a)-dist.get(b))[0];open.delete(u);if(u===goal)break;for(let v of surfaces){if(v===u||v.type==='spike'||!canTraverse(u,v))continue;let risk=v.type==='platform'?0:v.type==='bounce'?.6:v.type==='fan'?1.8:expert?5:1;let cost=dist.get(u)+Math.hypot(u.x-v.x,u.z-v.z)+risk*p.personality+(v.x<u.x?8:0);if(cost<(dist.get(v)??Infinity)){dist.set(v,cost);prev.set(v,u);open.add(v);}}}if(!dist.has(goal)){let candidates=[...dist.keys()].filter(s=>s.type!=='spike');let far=candidates.sort((a,b)=>b.x-a.x)[0];return recover(far,prev,start);}return recover(goal,prev,start);}
function recover(end,prev,start){let out=[],u=end;for(let i=0;u&&u!==start&&i<100;i++){out.unshift(u);u=prev.get(u);}return out;}
function activeFire(s){let f=(raceTime+s.offset)%4.5;return f>2&&f<3.6;}
function local(s,p){let dx=p.x-s.x,dz=p.z-s.z;return {x:dx*Math.cos(s.angle)-dz*Math.sin(s.angle),z:dx*Math.sin(s.angle)+dz*Math.cos(s.angle)};}
function bot(p,dt){if(isDown(p))return {x:0,z:0,jump:false};if(p.grabbedBy!==null){const h=players.find(q=>q.i===p.grabbedBy);const a=Math.atan2(p.z-h.z,p.x-h.x);return {x:Math.cos(a),z:Math.sin(a),jump:true};}if(p.giveUp){let edge=p.ground?p.ground.x+ext(p.ground).x-p.x:0;return {x:1,z:0,jump:!!p.ground&&edge<.8&&p.jumpCD<=0};}if(p.ground===surfaces[2])return {x:clamp((MAP.goalX+3-p.x)*2,-1,1),z:clamp(-p.z*2,-1,1),jump:false};if(!p.ground){if(p.launchSurface?.type==='bounce'&&!p.plan.length){p.noRoute=(p.noRoute||0)+dt;if(p.noRoute>2){p.giveUp=true;return {x:1,z:0,jump:false};}}let t=p.plan[0];return t?{x:clamp((t.x-p.x)*3,-7,7)/7,z:clamp((t.z-p.z)*3,-7,7)/7,jump:false}:{x:0,z:0,jump:false};}p.think-=dt;if(p.think<=0||!p.plan.length){p.plan=route(p.ground,p);p.think=.6;}let target=p.plan[0];if(target===p.ground){p.plan.shift();target=p.plan[0];}if(!target){p.noRoute=(p.noRoute||0)+dt;if(p.noRoute>2){p.giveUp=true;$('aiNote').textContent=p.name+' 找不到通往終點的可行路線，決定跳下雲海。';return {x:1,z:0,jump:false};}return {x:0,z:0,jump:false};}p.noRoute=0;let te=ext(target),ce=ext(p.ground);let tx=clamp(p.x,target.x-te.x+.6,target.x+te.x-.6),tz=clamp(p.z,target.z-te.z+.6,target.z+te.z-.6);let dx=tx-p.x,dz=tz-p.z,len=Math.hypot(dx,dz);if(len<.2){tx=target.x;tz=target.z;dx=tx-p.x;dz=tz-p.z;len=Math.hypot(dx,dz);}let edge=Math.min(Math.abs(dx)>.1?(ce.x-Math.sign(dx)*(p.x-p.ground.x))/Math.max(.01,Math.abs(dx)/(len||1)):99,Math.abs(dz)>.1?(ce.z-Math.sign(dz)*(p.z-p.ground.z))/Math.max(.01,Math.abs(dz)/(len||1)):99);let danger=target.type==='fire'&&activeFire(target);if(expert&&danger&&edge<1.3)return {x:0,z:0,jump:false};let nearHazard=surfaces.some(s=>['field','fire','cannon'].includes(s.type)&&Math.hypot(s.x-p.x,s.z-p.z)<4);return {x:dx/(len||1),z:dz/(len||1),jump:p.jumpCD<=0&&(edge<.85||(walkY(target)>p.y+.35&&len<1.2)||(expert&&nearHazard))};}
function die(p,why){if(!p.alive||p.finished)return;releasePlayerGrabs(p);p.alive=false;p.mesh.visible=false;if(p.i===0){$('status').textContent=why+' · 觀戰中，下一回合再來！';beep(150,.3);}scores();}
function releasePlayerGrabs(p){
 if(p.grabbing!==null)releaseGrab(p,players,'break');
 if(p.grabbedBy!==null)releaseGrab(players.find(q=>q.i===p.grabbedBy),players,'break');
}
function hitHazard(p,dx,dz,strength,lift,why){
 if(!hazardImpact(p,dx,dz,strength,lift))return false;
 releasePlayerGrabs(p);
 if(p.i===0){$('status').textContent=why+'！落地後會暫時倒地。';beep(180,.12);}
 return true;
}
function move(p,dt,input){
 p.jumpCD-=dt;
 p.struggleMoving=Math.hypot(input.x,input.z)>.1;p.struggleJump=!!input.jump;
 let mobility=isDown(p)?0:p.grabbing!==null?.52:p.grabbedBy!==null?.3:p.pendingKnockdown?.35:p.stagger>0?.45:1;
 const speed=(expert||p.i===0?7:6.4)*mobility;
 p.vx=T.MathUtils.damp(p.vx,input.x*speed,14,dt);p.vz=T.MathUtils.damp(p.vz,input.z*speed,14,dt);
 if(input.jump&&p.ground&&p.jumpCD<=0&&!isDown(p)&&!p.pendingKnockdown&&p.grabbedBy===null){
   p.vy=p.grabbing!==null?7:9.8;p.launchSurface=p.ground;p.ground=null;p.jumpCD=.32;if(!p.i)beep(480,.06);
 }
 const prevY=p.y;
 p.vy-=22*dt;p.x+=p.vx*dt;p.z+=p.vz*dt;integrateImpulse(p,dt);p.y+=p.vy*dt;p.ground=null;
 let landing=null;
 for(const surface of surfaces){
   const support=supportAt(surface,p.x,p.z);
   if(!support||p.vy>0||prevY<support.height-.16||p.y>support.height+.08)continue;
   if(support.normal.y<.5){p.vx+=support.normal.x*14*dt;p.vz+=support.normal.z*14*dt;continue;}
   if(!landing||support.height>landing.height)landing={surface,height:support.height};
 }
 if(landing){
   const surface=landing.surface;p.landingSpeed=-p.vy;p.y=landing.height;p.vy=0;p.ground=surface;
   if((p.pendingKnockdown||p.landingSpeed>16)&&!isDown(p)){
     knockDown(p);
     if(p.grabbing!==null)releaseGrab(p,players,'break');
     if(p.i===0)$('status').textContent='倒地了，稍等一下就會起身。';
   }
   if(surface.type==='bounce'&&p.jumpCD<=0&&!isDown(p)){
     // Landing is consumed before the trampoline clears ground. Air steering now aims at the NEXT surface.
     if(p.i>0){p.plan=route(surface,p);p.think=.6;if(p.plan.length)p.noRoute=0;}
     p.launchSurface=surface;p.vy=14;p.jumpCD=.5;p.ground=null;
   }
 }
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
   if(p.i===0){$('status').textContent='抵達終點！漂亮，等待其他玩家。';beep(1200,.25);}scores();
 }
 p.mesh.position.set(p.x,p.y,p.z);
 if(p.punchTime>=0)p.facing=p.attackYaw;
 else if(p.grabbing===null&&!isDown(p)&&Math.hypot(p.vx,p.vz)>.2)p.facing=Math.atan2(p.vz,p.vx);
 p.mesh.rotation.y=-p.facing;
}
function traps(dt){for(let s of surfaces){if(s.type==='rotate'){s.mesh.rotation.x=Math.sin((raceTime+s.offset)*.85)*1.45;updateSolidBounds(s);}if(s.type==='fire'){s.mesh.userData.flame.visible=activeFire(s);s.mesh.userData.base.material.emissive.setHex((raceTime+s.offset)%4.5>1.5?0x69331c:0);}if(s.type==='fan')s.mesh.userData.blades.rotation.x+=dt*16;if(s.type==='cannon'&&raceTime-s.lastShot>2.5){s.lastShot=raceTime;let m=sphere(.3,0x303f41,world);m.position.set(s.x+Math.cos(s.angle),s.y+.8,s.z-Math.sin(s.angle));shots.push({mesh:m,dx:Math.cos(s.angle)*10,dz:-Math.sin(s.angle)*10,age:0});}if(s.type==='field'&&raceTime-s.lastWave>4.2){s.lastWave=raceTime;let mesh=new T.Mesh(new T.TorusGeometry(1,.09,6,80),mat(0xb4a0ff,{emissive:0x8d68ff,emissiveIntensity:1}));mesh.rotation.x=Math.PI/2;mesh.position.set(s.x,s.y+.35,s.z);world.add(mesh);waves.push({mesh,x:s.x,z:s.z,y:s.y+.35,r:.2});}}
 shots=shots.filter(b=>{b.age+=dt;b.mesh.position.x+=b.dx*dt;b.mesh.position.z+=b.dz*dt;let blocked=surfaces.some(s=>s.y>b.mesh.position.y&&contains(s,b.mesh.position.x,b.mesh.position.z));if(b.age>6||blocked||b.spent){world.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();return false;}return true;});waves=waves.filter(w=>{w.r+=dt*3.2;w.mesh.scale.set(w.r,w.r,w.r);w.mesh.material.transparent=true;w.mesh.material.opacity=1-w.r/9;if(w.r>8){world.remove(w.mesh);w.mesh.geometry.dispose();w.mesh.material.dispose();return false;}return true;});}
function endRound(){grabHeld=false;clearGrabs(players);players.forEach(p=>{p.delta=p.finished?(finishOrder.length===players.length?1:3+(finishOrder[0]===p.i?1:0)):0;p.score+=p.delta;});document.exitPointerLock?.();setPhase('results',0,'回合結算','好路線還是壞心眼？下回合繼續加料。');show('results',true);let ranked=[...players].sort((a,b)=>b.score-a.score);$('resultEyebrow').textContent=round===8?'PARTY COMPLETE':'ROUND COMPLETE';$('resultTitle').textContent=round===8?ranked[0].name+' 贏得這場派對！':finishOrder.length?'有人成功突破工地！':'這條路，還需要一點創意。';$('resultNote').textContent=finishOrder.length+' / '+players.length+' 人抵達。'+(round===8?'這局已結束，可以再開一場。':'已放物件會保留。下一回合繼續搭路與設陷阱。');$('resultRows').innerHTML=ranked.map((p,i)=>`<div class="resultrow"><span>${String(i+1).padStart(2,'0')}</span><span class="dot" style="background:#${colors[p.i].toString(16)}"></span>${p.name}<small>${p.finished?'抵達':'未抵達'}</small><b>${p.score} <small>+${p.delta}</small></b></div>`).join('');$('next').textContent=round===8?'再開一場 ↗':'下一回合 →';scores();}
function toLobby(){practiceMode=false;document.exitPointerLock?.();phase='lobby';for(let id of ['hud','draft','buildTools','results'])show(id,false);show('lobby',true);show('previewNote',true);clean();makeMap();addSurface('platform',10,0);addSurface('bounce',15,1);addSurface('rotate',30,-1);addSurface('fan',36,2);addSurface('platform',40,0);resetPlayers(8);players.forEach((p,i)=>{p.x=i<4?i*1.2-2:21+(i-5);p.z=(i%3)*1.5-2;p.mesh.position.set(p.x,0,p.z);});}
const ray=new T.Raycaster(),pointer=new T.Vector2(),plane=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3();

const punchRay=new T.Raycaster();
function punchBlocked(a,b){
 const origin=new T.Vector3(a.x,a.y+(isDown(a)?.3:.85),a.z), direction=new T.Vector3(b.x,b.y+(isDown(b)?.3:.85),b.z).sub(origin), distance=direction.length();
 punchRay.set(origin,direction.normalize());punchRay.far=distance;
 return surfaces.some(s=>punchRay.intersectObjects(s.mesh.userData.solids,false).length>0);
}
function punchHit(attacker,victim){
 const m=label('POW!', '#f28a45');m.scale.set(1.6,.4,1);m.position.set(victim.x,victim.y+1.7,victim.z);world.add(m);impacts.push({mesh:m,age:0});
 if(attacker.i===0){$('status').textContent='命中 '+victim.name+'！';beep(220,.07);}
 else if(victim.i===0){$('status').textContent='被 '+attacker.name+' 打中了，穩住腳步！';beep(140,.08);}
}
function aiPunch(p){
 if(p.grabbing!==null){
   if(isDown(p)||raceTime>p.aiGrabUntil){releaseGrab(p,players);p.grabNeedsRelease=false;}
   return;
 }
 if(p.grabNeedsRelease&&p.grabCooldown<=0)p.grabNeedsRelease=false;
 if(isDown(p)||p.grabbedBy!==null||p.grabbing!==null||p.punchCooldown>0||p.stagger>0||p.giveUp||raceTime<1.2)return;
 const target=players.find(q=>q!==p&&q.alive&&!q.finished&&Math.abs(q.y-p.y)<.8&&Math.hypot(q.x-p.x,q.z-p.z)<1.5&&(Math.cos(Math.atan2(q.z-p.z,q.x-p.x)-p.facing)>.5||(p.aggroTime>0&&p.lastAttacker===q.i)));
 if(target&&p.i%3===1&&(isDown(target)||(Math.floor(raceTime/4)+p.i)%3===0)){
   if(startGrab(p,players,Math.atan2(target.z-p.z,target.x-p.x),punchBlocked)){p.aiGrabUntil=raceTime+2.2;return;}
 }
 if(target)startPunch(p,Math.atan2(target.z-p.z,target.x-p.x));
}
function practiceInput(p){
 if(isDown(p))return {x:0,z:0,jump:false};
 if(p.grabbing!==null)return {x:-Math.cos(p.facing)*.25,z:-Math.sin(p.facing)*.25,jump:false};
 if(p.grabbedBy!==null){const holder=players.find(q=>q.i===p.grabbedBy);const a=Math.atan2(p.z-holder.z,p.x-holder.x);return {x:Math.cos(a),z:Math.sin(a),jump:true};}
 const target=players.find(q=>q.i===p.lastAttacker&&q.alive&&!q.finished);
 if(p.aggroTime<=0||!target)return {x:0,z:0,jump:false};
 const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
 return {x:d>1.15?dx/d*.55:0,z:d>1.15?dz/d*.55:0,jump:false};
}
function practice(){
 start();practiceMode=true;show('draft',false);show('buildTools',false);
 setPhase('race',999,'拳擊練習場','左鍵出拳 · 按住右鍵抓人 · WASD／Space 掙脫');
 spawn();yaw=0;pitch=-.1;raceTime=0;
 players.forEach((p,i)=>{p.x=i===0?-1:1.1+Math.floor((i-1)/3)*2;p.z=i===0?0:((i-1)%3-1)*2;p.facing=i?Math.atan2(-p.z,-1-p.x):0;p.mesh.rotation.y=-p.facing;p.mesh.position.set(p.x,p.y,p.z);});
 $('controls').textContent='移動滑鼠轉視角 · WASD 移動 · Space 跳躍／掙脫 · 左鍵出拳 · 按住右鍵抓人';
 $('aiNote').textContent='練習場：AI 會還手、抓人與掙脫。右下方可體驗擊飛、倒地與自動起身。';
}
function testImpact(){
 if(practiceMode&&phase==='race'&&players[0].alive)hitHazard(players[0],1,0,6,6,'被測試衝擊擊飛');
}
let orbitDrag=null;
function stopGrabInput(){
 grabHeld=false;
 if(players[0]){releaseGrab(players[0],players);players[0].grabNeedsRelease=false;}
}
renderer.domElement.addEventListener('pointerdown',e=>{
 if(phase!=='race')return;
 if(e.button===2){e.preventDefault?.();grabHeld=true;startGrab(players[0],players,yaw,punchBlocked);return;}
 if(e.button===0&&startPunch(players[0],yaw)){players[0].mesh.rotation.y=-yaw;beep(360,.04);}
});
window.addEventListener('pointerup',e=>{if(e.button===2)stopGrabInput();});
window.addEventListener('pointercancel',stopGrabInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys={};stopGrabInput();}});

renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('pointerenter',e=>{orbitDrag={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointermove',e=>{
 if(phase!=='race'&&phase!=='build'){orbitDrag=null;return;}
 if(document.pointerLockElement===renderer.domElement)return;
 const dx=orbitDrag?e.clientX-orbitDrag.x:(e.movementX||0),dy=orbitDrag?e.clientY-orbitDrag.y:(e.movementY||0);
 orbitDrag={x:e.clientX,y:e.clientY};
 rotateView(clamp(dx,-150,150),clamp(dy,-150,150));
});
renderer.domElement.addEventListener('pointerleave',()=>orbitDrag=null);
document.addEventListener('mousemove',e=>{
 if((phase==='race'||phase==='build')&&document.pointerLockElement===renderer.domElement)rotateView(e.movementX,e.movementY,.0023);
});

window.addEventListener('keydown',e=>{if(['Space','ControlLeft','ControlRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.code==='Space'&&!e.repeat&&phase==='race')strugglePulse(players[0]);if(e.code==='Enter'&&phase==='build')placeHuman();if(e.code==='KeyR'&&!e.repeat&&phase==='build'&&!placed){rotatePlacement();}});window.addEventListener('keyup',e=>keys[e.code]=false);window.addEventListener('blur',()=>{keys={};orbitDrag=null;stopGrabInput();});
$('testImpact').onclick=testImpact;$('practice').onclick=practice;$('start').onclick=start;$('quit').onclick=toLobby;$('next').onclick=()=>round===8?start():beginRound();$('rotate').onclick=()=>{if(!placed){placementYaw+=Math.PI/2;updateGhost();}};$('ready').onclick=placeHuman;$('autoPlace').onclick=()=>{if(!placed){aim=suggest(players[0].pick);$('height').value=''+aim.y;updateGhost();}};$('helpBtn').onclick=()=>$('help').showModal();$('closeHelp').onclick=()=>$('help').close();$('soundBtn').onclick=()=>{muted=!muted;$('soundBtn').textContent=muted?'♫':'♪';$('soundBtn').style.background=muted?'':'#d2ff5a';beep();};
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let last=performance.now(),camTarget=new T.Vector3(),desired=new T.Vector3();camera.position.set(15,39,43);
function tick(now){requestAnimationFrame(tick);let dt=Math.min((now-last)/1000,.033);last=now;time+=dt;if(phase==='draft'){remaining-=dt;draftElapsed+=dt;let p=players.slice(1).find(p=>!p.pick&&draftElapsed>1.8+p.i*.55+((round+p.i)%3)*.2);if(p)aiPick(p);if(remaining<=0){for(let p of players)if(!p.pick)aiPick(p);}}else if(phase==='build'){remaining-=dt;buildElapsed+=dt;if(!placed){let f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),r=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),u=(keys.Space?1:0)-(keys.ControlLeft||keys.ControlRight?1:0),len=Math.hypot(f,r)||1;aim.x=clamp(aim.x+(f*Math.cos(buildView.yaw)-r*Math.sin(buildView.yaw))/len*22*dt,7,MAP.buildMaxX);aim.z=clamp(aim.z+(f*Math.sin(buildView.yaw)+r*Math.cos(buildView.yaw))/len*22*dt,-MAP.halfWidth,MAP.halfWidth);aim.y=clamp(aim.y+u*12*dt,-.5,MAP.maxBuildY);updateGhost();}let p=players.slice(1).find(p=>!p.built&&buildElapsed>1+p.i*.8);if(p)aiBuild(p);if(remaining<=0)beginRace();}else if(phase==='race'){remaining-=dt;raceTime+=dt;traps(dt);if(grabHeld){players[0].facing=yaw;startGrab(players[0],players,yaw,punchBlocked);}updateGrabs(players,dt,punchBlocked,(p,holder)=>{if(p.i===0)$('status').textContent='掙脫成功！';else if(holder.i===0)$('status').textContent=p.name+' 掙脫了！放開右鍵後可再次抓取。';});for(let p of players){if(!p.alive||p.finished)continue;let input;if(p.i===0){let x=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),z=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0),l=Math.hypot(x,z)||1;input={x:(x*Math.cos(yaw)-z*Math.sin(yaw))/l,z:(x*Math.sin(yaw)+z*Math.cos(yaw))/l,jump:!!keys.Space};}else input=practiceMode?practiceInput(p):bot(p,dt);move(p,dt,input);if(p.i>0)aiPunch(p);}
 resolvePlayerContacts(players,dt);updateCombat(players,dt,punchHit,punchBlocked);
 for(const p of players){if(p.alive&&!p.finished){p.mesh.position.set(p.x,p.y,p.z);animateAnimal(p,dt);}
   else if(practiceMode){releasePlayerGrabs(p);resetCombat(p);resetAnimal(p.mesh);Object.assign(p,{alive:true,finished:false,x:p.i===0?-1:2+Math.floor(p.i/3)*1.4,z:p.i===0?0:(p.i%3-1)*2,y:0,vx:0,vz:0,vy:0,ground:surfaces[0]});}
 }
 impacts=impacts.filter(e=>{e.age+=dt;e.mesh.position.y+=dt*1.2;e.mesh.material.opacity=Math.max(0,1-e.age/.45);if(e.age>.45){world.remove(e.mesh);e.mesh.material.map.dispose();e.mesh.material.dispose();return false;}return true;});
 const human=players[0];$('combatHint').hidden=false;
 let hint='左鍵出拳 · 右鍵抓人',meter=1-human.punchCooldown/COMBAT.cooldown;
 if(!human.alive||human.finished)hint='觀戰中';
 else if(isDown(human)){hint=human.downTime>0?'倒地中 · '+human.downTime.toFixed(1)+'s':'正在起身…';if(human.grabbedBy!==null)hint+=' · 起身後才能掙脫';meter=human.downTime>0?1-human.downTime/COMBAT.downSeconds:1-human.getUpTime/COMBAT.getUpSeconds;}
 else if(human.grabbedBy!==null){hint='被抓住！WASD／Space 掙脫 '+Math.round(human.escapeProgress*100)+'%';meter=human.escapeProgress;}
 else if(human.grabbing!==null){const target=players.find(p=>p.i===human.grabbing);hint='抓住 '+target.name+' · 放開右鍵鬆手';meter=1-target.escapeProgress;}
 else if(human.punchCooldown>0)hint='出拳冷卻 '+human.punchCooldown.toFixed(1)+'s · 右鍵抓人';
 $('combatHint').textContent=hint;$('combatHint').style.setProperty('--ready',(Math.max(0,meter)*100)+'%');
 if(!practiceMode&&(remaining<=0||players.every(p=>!p.alive||p.finished)))endRound();}
 $('testImpact').hidden=!practiceMode||phase!=='race';if(phase!=='race')$('combatHint').hidden=true;
 if(phase==='lobby'){for(let p of players){animateAnimal(p,dt,true);p.mesh.position.y=Math.sin(time*2+p.i)*.06;p.mesh.rotation.y=Math.sin(time*.3+p.i)*.2;}surfaces.forEach(s=>{if(s.type==='rotate'){s.mesh.rotation.x=Math.sin(time)*.6;updateSolidBounds(s);}if(s.type==='fan')s.mesh.userData.blades.rotation.x+=dt*10;});}
 $('clock').textContent=practiceMode?'∞':Math.max(0,Math.ceil(remaining));let targetX=54,targetZ=0;if(phase==='race'||phase==='build'){let focus=phase==='build'?aim:(players[0].alive&&!players[0].finished?players[0]:players.filter(p=>p.alive&&!p.finished).sort((a,b)=>b.x-a.x)[0]);if(focus){let a=phase==='build'?buildView.yaw:focus.i===0?yaw:Math.atan2(focus.vz,focus.vx),b=phase==='build'?buildView.pitch:focus.i===0?pitch:-.32;let distance=phase==='build'?10:7;desired.set(focus.x-Math.cos(a)*Math.cos(b)*distance,focus.y+2-Math.sin(b)*distance,focus.z-Math.sin(a)*Math.cos(b)*distance);for(let s of surfaces)if(contains(s,desired.x,desired.z)&&desired.y<s.y+1)desired.y=s.y+1;camera.position.lerp(desired,1-Math.exp(-dt*12));camera.lookAt(focus.x,focus.y+1.2,focus.z);}players.forEach(p=>p.mesh.visible=p.alive&&!p.finished);$('crosshair').hidden=phase!=='build';}else{players.forEach(p=>p.mesh.visible=p.alive&&!p.finished);$('crosshair').hidden=true;const fit=Math.max(1,1.65/camera.aspect);desired.set(89,100*fit,135*fit);camTarget.set(108,12,0);camera.position.lerp(desired,1-Math.exp(-dt*3));camera.lookAt(camTarget);}renderer.render(scene,camera);}
async function boot(){
 try{await loadCharacters();toLobby();$('loading').remove();requestAnimationFrame(tick);}
 catch(error){console.error(error);$('loading').textContent='角色載入失敗，請重新整理頁面再試一次。';}
}
boot();
// Diagnostics expose state only.
window.partyDebug={get state(){return {phase,round,remaining,surfaces:surfaces.length,players:players.map(p=>({name:p.name,x:p.x,y:p.y,z:p.z,alive:p.alive,finished:p.finished,score:p.score}))};}};
