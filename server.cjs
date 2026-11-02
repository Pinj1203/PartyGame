const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('./vendor/ws');
const root=path.join(__dirname,'dist');
const TYPES=new Set(['platform','rotate','bounce','ice','spike','cannon','fan','field','spinner','pendulum','boulder','movingHorizontal','movingVertical','hammer']);
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const safeName=n=>String(n||'玩家').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,14)||'玩家';
function createPartyServer({port=Number(process.env.PORT||4180),host=process.env.HOST||'0.0.0.0'}={}){
 const rooms=new Map(),clients=new Set();
 const server=http.createServer((req,res)=>{
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,rooms:rooms.size,protocol:2}));return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)||name.split('/').some(s=>s.startsWith('.'))){res.writeHead(403).end();return;}
  fs.readFile(file,(error,data)=>{
   if(error){res.writeHead(404).end();return;}
   const mime={'.js':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.gltf':'model/gltf+json','.png':'image/png','.txt':'text/plain; charset=utf-8'};
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-cache');
   res.end(req.method==='HEAD'?undefined:data);
  });
 });
 const wss=new WebSocketServer({noServer:true,maxPayload:256*1024,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  let valid=false;try{valid=new URL(req.url,'http://local').pathname==='/party'&&(!req.headers.origin||new URL(req.headers.origin).host===req.headers.host);}catch{}
  if(!valid||clients.size>=200){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 const send=(ws,data)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<1024*1024)ws.send(JSON.stringify(data));};
 const broadcast=(room,data,except)=>room.members.forEach(m=>{
  const socket=m?.socket;if(socket===except)return;
  if(data.type==='state'){
   if(socket?.readyState!==WebSocket.OPEN||socket.bufferedAmount>16384)return;
   const state=data.state.version===2&&socket.sceneRevision!==data.state.sceneRevision?{...data.state,meta:room.lastState.meta}:data.state;
   send(socket,{type:'state',state});socket.sceneRevision=state.sceneRevision;return;
  }
  send(socket,data);
 });
 const roomData=room=>({code:room.code,capacity:room.capacity,running:room.running,match:room.match,expert:room.expert,
  members:Array.from({length:room.capacity},(_,slot)=>{const m=room.members[slot];return {slot,name:m?.name||['Mochi','Nova','Kiwi','Miso','Bolt','Luna','Tofu','Pepper','Bean','Pip'][slot],human:!!m?.socket,connected:!!m?.socket,reserved:!!m&&!m.socket};})});
 const announce=room=>broadcast(room,{type:'room',room:roomData(room)});
 function leave(ws,explicit=false){
  const room=ws.room;if(!room)return;ws.room=null;
  const member=room.members[ws.slot];if(member?.socket!==ws)return;
  member.socket=null;member.leftAt=Date.now();
  if(ws.slot===0){broadcast(room,{type:'closed',reason:'房主已離線，房間結束。請重新開房。'});room.members.forEach(m=>{if(m?.socket)m.socket.room=null;});rooms.delete(room.code);return;}
  if(explicit||!room.running)room.members[ws.slot]=null;
  announce(room);send(room.members[0]?.socket,{type:'input',slot:ws.slot,input:{x:0,z:0,jump:false,grab:false,actions:{}}});
 }
 wss.on('connection',ws=>{
  clients.add(ws);ws.alive=true;ws.bucketAt=Date.now();ws.messages=0;ws.bad=0;
  ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
  send(ws,{type:'hello',protocol:2});
  ws.on('message',(buffer,binary)=>{
   if(binary)return ws.close(1003,'JSON only');
   const now=Date.now();if(now-ws.bucketAt>1000){ws.bucketAt=now;ws.messages=0;}
   if(++ws.messages>160)return ws.close(1008,'Rate limit');
   let m;try{m=JSON.parse(buffer);}catch{if(++ws.bad>3)ws.close(1008,'Invalid JSON');return;}
   if(!m||typeof m!=='object')return;
   const fail=message=>send(ws,{type:'error',message});
   if(m.type==='ping'){send(ws,{type:'pong',time:m.time});return;}
   if(m.type==='create'){
    if(ws.room)return fail('你已經在房間裡。');if(rooms.size>=32)return fail('伺服器房間已滿，請稍後再試。');
    const capacity=Number(m.capacity);if(!Number.isInteger(capacity)||capacity<6||capacity>10)return fail('總人數必須為 6～10 人。');
    let code;do{code=Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(31)]).join('');}while(rooms.has(code));
    const room={code,capacity,protocol:m.protocol??1,members:[],running:false,match:0,expert:m.expert!==false,lastState:null,lastSeq:-1,created:now,lastStateAt:now};rooms.set(code,room);
    const member={slot:0,name:safeName(m.name),socket:ws,token:crypto.randomBytes(18).toString('hex')};room.members[0]=member;ws.room=room;ws.slot=0;
    send(ws,{type:'joined',slot:0,token:member.token,room:roomData(room)});announce(room);return;
   }
   if(m.type==='join'){
    if(ws.room)return fail('你已經在房間裡。');
    const code=String(m.code||'').trim().toUpperCase();const room=rooms.get(code);if(!room)return fail('找不到房間，請確認房號與遊戲網址。');if((m.protocol??1)!==room.protocol)return fail('遊戲版本不同，請房主與朋友都重新整理後再開房。');
    let member=room.members.find(p=>p&&p.token===m.token&&!p.socket&&now-p.leftAt<60000);
    if(!member){if(room.running)return fail('這間房已開始，請等房主開新的一局。');const slot=Array.from({length:room.capacity},(_,i)=>i).find(i=>!room.members[i]?.socket);if(slot===undefined)return fail('房間已滿。');member={slot,name:safeName(m.name),token:crypto.randomBytes(18).toString('hex')};room.members[slot]=member;}
    member.socket=ws;ws.room=room;ws.slot=member.slot;
    send(ws,{type:'joined',slot:member.slot,token:member.token,room:roomData(room)});announce(room);
    if(room.running){send(ws,{type:'start',room:roomData(room)});if(room.lastState)send(ws,{type:'state',state:room.lastState});}
    return;
   }
   const room=ws.room;if(!room)return fail('請先建立或加入房間。');
   if(m.type==='leave'){leave(ws,true);send(ws,{type:'left'});return;}
   if(m.type==='settings'){
    if(ws.slot!==0||room.running)return fail('只有房主可在等待時調整人數。');
    if(!Number.isInteger(m.capacity)||m.capacity<6||m.capacity>10||room.members.some((p,i)=>p?.socket&&i>=m.capacity))return fail('人數設定不能少於已加入玩家的位置。');
    room.capacity=m.capacity;room.expert=m.expert!==false;announce(room);return;
   }
   if(m.type==='start'){
    if(ws.slot!==0||room.running)return fail('請等待房主開始。');
    room.running=true;room.match++;room.lastState=null;room.lastSeq=-1;room.lastStateAt=now;
    broadcast(room,{type:'start',room:roomData(room)});announce(room);return;
   }
   if(m.type==='lobby'){
    if(ws.slot!==0)return fail('請等待房主返回房間。');
    room.running=false;room.lastState=null;room.members.forEach((p,i)=>{if(p&&!p.socket)room.members[i]=null;});announce(room);return;
   }
   if(!room.running)return;
   if(m.type==='resync'){if(room.lastState)send(ws,{type:'state',state:room.lastState});return;}
   if(m.type==='input'){
    const p=m.input;if(ws.slot===0||!p||!finite(p.x,-1,1)||!finite(p.z,-1,1)||Math.hypot(p.x,p.z)>1.02)return;
    const actions={};for(const key of ['jump','dive','punch'])if(Number.isSafeInteger(p.actions?.[key])&&p.actions[key]>=0)actions[key]=p.actions[key];
    let commands;
    if(m.commands){
     if(!Array.isArray(m.commands)||m.commands.length>30||!Number.isInteger(m.round))return;
     commands=[];
     for(const c of m.commands){
      if(!Number.isSafeInteger(c.seq)||c.seq<1||!finite(c.x,-1,1)||!finite(c.z,-1,1)||Math.hypot(c.x,c.z)>1.02)return;
      const a={};for(const key of ['jump','dive','punch'])if(Number.isSafeInteger(c.actions?.[key])&&c.actions[key]>=0)a[key]=c.actions[key];
      commands.push({seq:c.seq,x:c.x,z:c.z,jump:c.jump===true,grab:c.grab===true,actions:a});
     }
    }
    send(room.members[0]?.socket,{type:'input',slot:ws.slot,round:m.round,commands,input:{x:p.x,z:p.z,jump:p.jump===true,grab:p.grab===true,actions}});return;
   }
   if(m.type==='command'){
    if(m.command==='claim'&&Number.isInteger(m.index)&&m.index>=0&&m.index<12)send(room.members[0]?.socket,{type:'command',slot:ws.slot,command:'claim',index:m.index,round:m.round});
    if(m.command==='place'&&finite(m.x,7,207)&&finite(m.y,-.5,40)&&finite(m.z,-48,48)&&finite(m.angle,-100,100))send(room.members[0]?.socket,{type:'command',slot:ws.slot,command:'place',x:m.x,y:m.y,z:m.z,angle:m.angle,round:m.round});
    return;
   }
   if(m.type==='notice'&&ws.slot===0){send(room.members[m.slot]?.socket,{type:'notice',message:String(m.message).slice(0,140)});return;}
   if(m.type==='state'&&ws.slot===0){
    const s=m.state;
    if(!s||s.match!==room.match||!Number.isInteger(s.seq)||s.seq<=room.lastSeq||!Array.isArray(s.players)||s.players.length!==room.capacity||!['draft','build','race','results'].includes(s.phase))return;
    if(s.version===2){
     const meta=s.meta??(room.lastState?.sceneRevision===s.sceneRevision?room.lastState.meta:null);
     if(!meta||!Number.isSafeInteger(s.sceneRevision)||!Array.isArray(meta.surfaces)||meta.surfaces.length>256||!meta.surfaces.every(p=>TYPES.has(p.type)))return;
     if(!finite(s.raceTime,0,1000)||!s.players.every((p,i)=>p.i===i&&Array.isArray(p.v)&&p.v.length<=80&&[0,1,2].every(k=>finite(p.v[k],-500,500))))return;
     room.lastState={...s,meta};room.lastSeq=s.seq;room.lastStateAt=now;broadcast(room,{type:'state',state:s},ws);return;
    }
    if(!Array.isArray(s.surfaces)||s.surfaces.length>256)return;
    if(!s.players.every((p,i)=>p.i===i&&finite(p.x,-500,500)&&finite(p.y,-500,500)&&finite(p.z,-500,500))||!s.surfaces.every(p=>TYPES.has(p.type)))return;
    room.lastState=s;room.lastSeq=s.seq;room.lastStateAt=now;broadcast(room,{type:'state',state:s},ws);return;
   }
  });
  ws.on('close',()=>{clients.delete(ws);leave(ws);});
 });
 const heartbeat=setInterval(()=>{
  for(const ws of clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}
 },10000);heartbeat.unref();
 return {server,rooms,wss,listen:()=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address()))),close:()=>new Promise(resolve=>{clearInterval(heartbeat);for(const ws of clients)ws.terminate();wss.close();server.close(resolve);})};
}
if(require.main===module){const app=createPartyServer();app.listen().then(a=>console.log(`SKYBUILD multiplayer: http://127.0.0.1:${a.port}/`));}
module.exports={createPartyServer};
