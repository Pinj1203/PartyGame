import fs from 'node:fs';
let game=fs.readFileSync('work/game-before-multiplayer.js','utf8');
function change(a,b){if(!game.includes(a))throw Error('Missing '+a.slice(0,120));game=game.replace(a,b);}
change("import { DivePlanner } from './ai-dive.js';","import { DivePlanner } from './ai-dive.js';\nimport { PartyNetwork } from './network.js';");
change('let practiceMode=false, grabPractice=false, impacts=[], grabHeld=false;',`let practiceMode=false, grabPractice=false, impacts=[], grabHeld=false;
let net=null,roomClock=null,networkFrameAt=0,networkMatch=0,placementPending=false;
const localId=()=>net?.online?net.slot:0,localPlayer=()=>players[localId()];
const isBot=p=>net?.running?!net.room.members[p.i]?.human:p.i>0;
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`);
game=game.replaceAll('players[0]','localPlayer()').replaceAll('p.i===0','p.i===localId()').replaceAll('p.i>0','isBot(p)');
game=game.replace('const isBot=p=>net?.running?!net.room.members[p.i]?.human:isBot(p);','const isBot=p=>net?.running?!net.room.members[p.i]?.human:p.i>0;');
for(const name of ['focus','attacker','victim','holder'])game=game.replaceAll(name+'.i===0',name+'.i===localId()');
game=game.replaceAll('${p.name}','${html(p.name)}').replaceAll('${players[s.owner].name}','${html(players[s.owner].name)}');
change('function legal(a,t=localPlayer()?.pick){','function legal(a,t=localPlayer()?.pick,angle=placementYaw){');
change('w:3.6,d:3.6,angle:placementYaw});','w:3.6,d:3.6,angle});');
change('function claim(p,i){if(',"function claim(p,i){if(net?.isGuest){net.send({type:'command',command:'claim',index:i,round});return;}if(");
change('function placeHuman(){if(',"function placeHuman(){if(net?.isGuest){if(phase!=='build'||placed||placementPending)return;if(!legal(aim)){$('status').textContent='這裡會重疊，換個位置或高度。';return;}placementPending=true;net.send({type:'command',command:'place',...aim,angle:placementYaw,round});$('ready').disabled=true;$('status').textContent='正在確認放置…';return;}if(");
change('function beginBuild(){show(','function beginBuild(){placementPending=false;show(');
change('if(!legal(a,p.pick)){p.built=true;','if(!legal(a,p.pick,0)){p.built=true;');
change('const speed=(expert||p.i===localId()?7:6.4)*mobility;','const speed=(expert||!isBot(p)?7:6.4)*mobility;');
change('if(!p.i)beep(480,.06);','if(p.i===localId())beep(480,.06);');
change('function stopGrabInput(){\n grabHeld=false;','function stopGrabInput(){\n grabHeld=false;\n if(net?.isGuest)return;');
change(" if(phase!=='race')return;\n if(e.button===2)"," if(phase!=='race')return;\n if(net?.isGuest){if(e.button===2){e.preventDefault?.();grabHeld=true;}else if(e.button===0)net.action('punch');return;}\n if(e.button===2)");
change("if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat&&!wasShift&&phase==='race')localPlayer().shiftAction=true;if(e.code==='Space'&&!e.repeat&&phase==='race')strugglePulse(localPlayer());","if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat&&!wasShift&&phase==='race'){if(net?.isGuest)net.action('dive');else localPlayer().shiftAction=true;}if(e.code==='Space'&&!e.repeat&&phase==='race'){if(net?.isGuest)net.action('jump');else strugglePulse(localPlayer());}");
change("$('quit').onclick=toLobby;","$('quit').onclick=()=>net?.online?net.leave():toLobby();");
change("$('next').onclick=()=>round===8?start():beginRound();","$('next').onclick=()=>{if(net?.online){if(!net.isHost)return;if(round===8){net.send({type:'lobby'});return;}}round===8?start():beginRound();};");
change('function practice(){\n start();','function practice(){\n if(net?.online)net.leave();\n start();');
const from=game.indexOf('function raceInput(p,dt){'),to=game.indexOf('function tick(now)',from);
game=game.slice(0,from)+`function humanInput(){
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
`+game.slice(to);
change('function tick(now){requestAnimationFrame(tick);',"function tick(now,networkClock=false){if(!networkClock)requestAnimationFrame(tick);if(net?.isHost&&net.running&&!networkClock)return;if(networkClock&&!(net?.isHost&&net.running))return;");
change("last=now;time+=dt;if(phase==='draft')","last=now;time+=dt;if(net?.isGuest&&net.running){guestFrame(dt);renderFrame(dt);return;}if(phase==='draft')");
change('players.slice(1).find(p=>!p.pick&&draftElapsed','players.filter(isBot).find(p=>!p.pick&&draftElapsed');
change('players.slice(1).find(p=>!p.built&&buildElapsed','players.filter(isBot).find(p=>!p.built&&buildElapsed');
const buildStart=game.indexOf('if(!placed){let f=(keys.KeyW'),buildEnd=game.indexOf('let p=players.filter(isBot).find',buildStart);
if(buildStart<0||buildEnd<0)throw Error('build tick missing');
const buildMovement=game.slice(buildStart,buildEnd);game=game.slice(0,buildStart)+'updateBuildAim(dt);'+game.slice(buildEnd);
const hintStart=game.indexOf(' const human=localPlayer();'),hintEnd=game.indexOf(' if(!practiceMode&&(remaining<=0',hintStart);
if(hintStart<0||hintEnd<0)throw Error('combat hint missing');
const combatHUD=game.slice(hintStart,hintEnd);game=game.slice(0,hintStart)+' updateCombatHUD();\n'+game.slice(hintEnd);
const renderStart=game.indexOf(" $('testRagdoll').hidden=!practiceMode"),renderEnd=game.indexOf('\nasync function boot()',renderStart);
if(renderStart<0||renderEnd<0)throw Error('render missing');
const renderBody=game.slice(renderStart,renderEnd);
game=game.slice(0,renderStart)+` renderFrame(dt);if(net?.isHost&&net.running)net.snapshot(networkSnapshot());
}
function updateBuildAim(dt){${buildMovement}}
function updateCombatHUD(){${combatHUD}}
function renderFrame(dt){
`+renderBody+game.slice(renderEnd);
change("try{await loadCharacters();toLobby();$('loading').remove();","try{await loadCharacters();toLobby();setupMultiplayer();$('loading').remove();");
game=game.replace("   console.info('Pointer lock request state:',JSON.stringify({focused:document.hasFocus?.(),visibility:document.visibilityState,connected:renderer.domElement.isConnected,fullscreen:!!document.fullscreenElement}));\n",'');
fs.writeFileSync('dist/game.js',game);
console.log('Multiplayer controls and render separation applied.');
