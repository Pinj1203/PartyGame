import {NET_VERSION,STEP,SnapshotEncoder,SnapshotDecoder,PacketCadence} from './netcode.js';
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class PartyNetwork {
 constructor(hooks={}){
  this.encoder=new SnapshotEncoder();this.decoder=new SnapshotDecoder();this.commandQueue=[];this.inputCadence=new PacketCadence(1000/30);this.stateCadence=new PacketCadence(50);this.lastInput=null;this.hooks=hooks;this.room=null;this.slot=0;this.socket=null;this.inputs=new Map();this.actions={jump:0,dive:0,punch:0};this.sequence=0;this.lastSend=0;this.lastReceive=0;this.retry=0;this.leaving=false;
  const $=id=>document.getElementById(id);this.$=$;
  $('createRoom').onclick=()=>this.enter('create');$('joinRoom').onclick=()=>this.enter('join');
  $('roomCode').addEventListener('input',()=>{$('roomCode').value=$('roomCode').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);});
  $('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')this.enter('join');});
  $('roomStart').onclick=()=>this.send({type:'start'});$('roomLeave').onclick=()=>this.leave();
  $('roomCapacity').onchange=()=>this.send({type:'settings',capacity:+$('roomCapacity').value,expert:$('difficulty').value==='expert'});
  $('copyRoom').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',this.room.code);try{await navigator.clipboard.writeText(url.href);$('roomMessage').textContent='邀請網址已複製，傳給朋友即可。';}catch{$('roomMessage').textContent='請複製下方邀請網址。';$('inviteURL').select();}};
  try{$('playerName').value=localStorage.getItem('skybuild-name')||'玩家';}catch{}
  const code=new URL(location.href).searchParams.get('room');if(code)$('roomCode').value=code.toUpperCase().slice(0,6);
  this.pingTimer=setInterval(()=>{if(this.room)this.send({type:'ping',time:Date.now()});},3000);
 }
 get online(){return !!this.room;}
 get isHost(){return this.online&&this.slot===0;}
 get isGuest(){return this.online&&this.slot!==0;}
 get running(){return !!this.room?.running;}
 send(m){if(this.socket?.readyState===1&&this.socket.bufferedAmount<512*1024){this.socket.send(JSON.stringify(m));return true;}return false;}
 status(text){this.$('netMessage').textContent=text;this.$('roomMessage').textContent=text;}
 enter(type){
  if(this.room)return;const name=this.$('playerName').value.trim()||'玩家',code=this.$('roomCode').value.trim().toUpperCase();
  if(type==='join'&&!/^[A-Z0-9]{6}$/.test(code)){this.status('請輸入 6 碼房號。');return;}
  try{localStorage.setItem('skybuild-name',name);}catch{}
  this.leaving=false;this.pending={type,protocol:NET_VERSION,name,code,capacity:+this.$('count').value,expert:this.$('difficulty').value==='expert'};this.connect();
 }
 connect(){
  if(this.socket?.readyState===0)return;
  if(this.socket?.readyState===1){this.send(this.pending);this.pending=null;return;}
  this.status(this.retry?'連線中斷，正在重新加入…':'正在連接房間伺服器…');
  const url=new URL('/party',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(url);this.socket=socket;
  const timeout=setTimeout(()=>{if(socket.readyState===0)socket.close();},8000);
  socket.onopen=()=>{clearTimeout(timeout);if(this.pending){this.send(this.pending);this.pending=null;}};
  socket.onerror=()=>{};
  socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}this.receive(m);};
  socket.onclose=()=>{
   clearTimeout(timeout);if(this.socket!==socket)return;this.socket=null;
   if(this.leaving)return;
   if(this.room&&this.slot!==0&&this.retry<8){this.retry++;this.pending={type:'join',protocol:NET_VERSION,code:this.room.code,token:this.token,name:this.$('playerName').value};this.status('連線中斷，正在重新加入；暫由 AI 接手。');this.hooks.onStall?.();setTimeout(()=>{if(!this.leaving)this.connect();},Math.min(3000,500*this.retry));}
   else{this.finish(this.room?'連線已中斷，請重新加入房間。':'無法連上房間伺服器。請確認使用同一個遊戲網址。');}
  };
 }
 receive(m){
  if(m.type==='hello'&&m.protocol<NET_VERSION){this.finish('房間服務需要更新，請稍後重新整理再開房。');return;}
  if(m.type==='joined'){this.slot=m.slot;this.token=m.token;this.room=m.room;this.retry=0;this.inputs.clear();this.actions={jump:0,dive:0,punch:0};this.status('');this.renderRoom();this.hooks.onRoom?.(this.room);return;}
  if(m.type==='room'){const wasRunning=this.running;this.room=m.room;this.renderRoom();this.hooks.onRoom?.(this.room);if(wasRunning&&!this.running)this.hooks.onLobby?.();return;}
  if(m.type==='start'){this.room=m.room;this.sequence=0;this.encoder=new SnapshotEncoder();this.decoder=new SnapshotDecoder();this.commandQueue=[];this.inputCadence=new PacketCadence(1000/30);this.stateCadence=new PacketCadence(50);this.lastInput=null;this.inputs.clear();this.actions={jump:0,dive:0,punch:0};this.lastReceive=performance.now();this.renderRoom();this.hooks.onStart?.(this.room);return;}
  if(m.type==='input'){const previous=this.inputs.get(m.slot),queue=previous?.round===m.round?(previous.commands??[]):[];if(m.commands)for(const c of m.commands)if(c.seq>(previous?.lastSeq??0)&&!queue.some(q=>q.seq===c.seq))queue.push(c);if(queue.length>30)queue.splice(0,queue.length-30);this.inputs.set(m.slot,{...m.input,received:performance.now(),commands:queue,lastSeq:Math.max(previous?.lastSeq??0,...(m.commands||[]).map(c=>c.seq)),round:m.round,sequenced:!!m.commands});return;}
  if(m.type==='command'){this.hooks.onCommand?.(m);return;}
  if(m.type==='state'){const state=this.decoder.decode(m.state);if(!state){this.send({type:'resync'});return;}this.lastReceive=performance.now();this.hooks.onState?.(state);return;}
  if(m.type==='notice'){this.hooks.onNotice?.(m.message);return;}
  if(m.type==='pong'){this.$('connectionBadge').textContent=`房號 ${this.room?.code||''} · ${Math.max(0,Date.now()-m.time)} ms`;return;}
  if(m.type==='error'){this.status(m.message);if(this.retry)this.finish(m.message);return;}
  if(m.type==='closed'||m.type==='left'){this.finish(m.reason||'已離開房間。');}
 }
 renderRoom(){
  const $=this.$,r=this.room;if(!r)return;
  $('roomPanel').hidden=r.running;$('lobby').hidden=true;$('previewNote').hidden=true;
  $('roomNumber').textContent=r.code;$('roomCapacity').value=String(r.capacity);$('roomCapacity').disabled=!this.isHost||r.running;
  $('roomStart').hidden=!this.isHost;$('roomStart').textContent=`開始 ${r.capacity} 人派對 ↗`;
  $('roomLeave').textContent=this.isHost?'關閉房間':'離開房間';
  const human=r.members.filter(p=>p.human).length;
  $('roomSummary').textContent=`${human} 位玩家 + ${r.capacity-human} 位 AI · 空位自動補滿`;
  $('roomWaiting').textContent=this.isHost?'朋友都到齊後即可開始，不足的人數會由 AI 補上。':'等待房主開始；你可以先把房號分享給其他朋友。';
  $('roomMembers').innerHTML=r.members.map(p=>`<div class="room-member ${p.human?'human':''}"><span class="dot" style="background:${['#f58055','#a494eb','#76c6bc','#e2bd54','#e58fb0','#7eb478','#6eacd7','#c0b08c','#b57aaf','#9abac6'][p.slot]}"></span><b>${escapeHTML(p.name)}${p.slot===this.slot?'（你）':''}</b><small>${p.human?p.slot===0?'房主':'已加入':p.reserved?'AI 暫代':'AI 補位'}</small></div>`).join('');
  const url=new URL(location.href);url.searchParams.set('room',r.code);$('inviteURL').value=url.href;
  $('connectionBadge').hidden=false;$('connectionBadge').textContent=`房號 ${r.code} · ${human}/${r.capacity} 玩家`;
 }
 action(name){this.actions[name]++;}
 input(input,commands=[]){
  this.commandQueue.push(...commands);if(this.commandQueue.length>30)this.commandQueue.splice(0,this.commandQueue.length-30);
  const now=performance.now(),previous=this.lastInput;
  const changed=!previous||['x','z','jump','grab'].some(k=>previous[k]!==input[k])||['jump','dive','punch'].some(k=>previous.actions[k]!==this.actions[k]);
  const urgent=changed&&this.commandQueue.length>0&&now-this.lastSend>=STEP*1000;
  if((!this.inputCadence.due(now)&&!urgent)||this.socket?.bufferedAmount>8192)return;
  const packet={type:'input',round:input.round,input:{...input,actions:this.actions},commands:this.commandQueue};
  if(this.send(packet)){this.lastSend=now;this.inputCadence.sent(now);this.lastInput={...input,actions:{...this.actions}};this.commandQueue=[];}
 }
 snapshot(factory){
  const now=performance.now();if(!this.stateCadence.due(now)||this.socket?.bufferedAmount>16384)return;
  const state=typeof factory==='function'?factory():factory;state.match=this.room.match;state.seq=this.sequence+1;
  const frame=this.encoder.encode(state);if(this.send({type:'state',state:frame})){this.lastSend=now;this.stateCadence.sent(now);this.sequence++;this.encoder.committed(frame);}
 }
 leave(){this.leaving=true;this.send({type:'leave'});this.socket?.close();this.finish('已離開房間。');}
 finish(message){this.leaving=true;this.room=null;this.slot=0;this.inputs.clear();this.socket?.close();this.socket=null;this.$('roomPanel').hidden=true;this.$('connectionBadge').hidden=true;this.hooks.onClose?.();this.status(message);}
}
