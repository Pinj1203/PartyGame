import {SnapshotEncoder,SnapshotDecoder} from '../dist/netcode.js';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createPartyServer}=require('../server.cjs'),WebSocket=require('../vendor/ws');
const app=createPartyServer({port:0,host:'127.0.0.1'}),address=await app.listen(),url='ws://127.0.0.1:'+address.port+'/party';
const connections=[];
async function client(){
 const ws=new WebSocket(url),queue=[],waiting=[];connections.push(ws);
 ws.on('message',data=>{const m=JSON.parse(data),i=waiting.findIndex(w=>w.type===m.type&&w.test(m));if(i>=0){const w=waiting.splice(i,1)[0];clearTimeout(w.timer);w.resolve(m);}else queue.push(m);});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 return {ws,send:m=>ws.send(JSON.stringify(m)),wait:(type,test=()=>true)=>{const i=queue.findIndex(m=>m.type===type&&test(m));if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={type,test,resolve,timer:setTimeout(()=>reject(Error('Timed out: '+type+'; queued='+JSON.stringify(queue))),5000)};waiting.push(w);});}};
}
try{
 const health=await (await fetch('http://127.0.0.1:'+address.port+'/health')).json();assert.equal(health.protocol,2);
 const host=await client();host.send({type:'create',capacity:10,name:'Host',expert:true});const created=await host.wait('joined');const code=created.room.code;assert.match(code,/^[A-Z0-9]{6}$/);
 assert.equal(created.room.members.filter(m=>!m.human).length,9);
 const peers=[];
 for(let i=1;i<10;i++){const peer=await client();peer.send({type:'join',code,name:'Friend '+i});const joined=await peer.wait('joined');assert.equal(joined.slot,i);peer.token=joined.token;peers.push(peer);}
 const extra=await client();extra.send({type:'join',code,name:'Extra'});assert.match((await extra.wait('error')).message,/已滿/);
 peers[0].send({type:'start'});assert.match((await peers[0].wait('error')).message,/房主/);
 host.send({type:'start'});const started=await host.wait('start');assert.equal(started.room.members.filter(m=>m.human).length,10);
 await peers[0].wait('start');extra.send({type:'join',code,name:'Extra'});assert.match((await extra.wait('error')).message,/已開始/);
 peers[0].send({type:'input',slot:0,input:{x:1,z:0,jump:true,grab:false,actions:{jump:1,dive:0,punch:0}}});const input=await host.wait('input');assert.equal(input.slot,1,'socket identity overrides spoofed slot');assert.equal(input.input.x,1);
 const state={mapSeed:4294967294,match:started.room.match,seq:1,phase:'race',round:1,remaining:50,players:Array.from({length:10},(_,i)=>({i,x:i,y:0,z:0,score:i===0?3:0,roundKnockouts:i===0?2:0})),surfaces:Array.from({length:103},(_,id)=>({id,type:['platform','spinner','pendulum','boulder','hammer','movingHorizontal','movingVertical'][id%7],x:id,y:0,z:0,h:1+id%12,frozen:id%3===0})),facilityRocks:[{id:1,x:152,y:17.65,z:5,q:[0,0,0,1]}]};
 peers[0].send({type:'state',state});assert.equal(app.rooms.get(code).lastState,null,'guests cannot replace authoritative state');
 host.send({type:'state',state});const relayed=(await peers[0].wait('state')).state;assert.equal(relayed.seq,1);assert.equal(relayed.players[0].roundKnockouts,2);assert(relayed.surfaces.some(s=>s.type==='hammer'),'new rotating hammers survive server validation');assert(relayed.surfaces.some(s=>s.type==='movingHorizontal'));assert(relayed.surfaces.some(s=>s.type==='movingVertical'));assert.equal(relayed.mapSeed,state.mapSeed);assert.equal(relayed.surfaces[7].h,state.surfaces[7].h);assert.equal(relayed.surfaces.length,103,'up to twenty-three islands plus eight rounds of ten props fits the server limit');assert.deepEqual(relayed.facilityRocks,state.facilityRocks);assert.deepEqual(relayed.surfaces.map(s=>s.frozen),state.surfaces.map(s=>s.frozen),'ice flags survive WebSocket relay');
 const codec=new SnapshotEncoder(),decode=new SnapshotDecoder();
 const compactSource={...state,seq:2,raceTime:10,expert:true,selection:[],title:'race',hint:'',result:{},shots:[],waves:[]};
 const compact=codec.encode(compactSource);host.send({type:'state',state:compact});codec.committed(compact);
 const compactRelay=(await peers[0].wait('state',m=>m.state.seq===2)).state;assert.equal(decode.decode(compactRelay).surfaces.length,103);
 compactSource.seq=3;compactSource.raceTime=10.05;const delta=codec.encode(compactSource);assert(!delta.meta);
 host.send({type:'state',state:delta});const deltaRelay=(await peers[0].wait('state',m=>m.state.seq===3)).state;assert(!deltaRelay.meta,'unchanged metadata omitted in live relay');assert.equal(decode.decode(deltaRelay).players[2].x,2);
 assert(app.rooms.get(code).lastState.meta,'relay retains full scene for reconnect');
 peers[0].send({type:'input',round:1,input:{x:1,z:0,jump:false,grab:false,actions:{jump:2}},commands:[{seq:1,x:1,z:0,jump:false,grab:false,actions:{jump:2}},{seq:2,x:1,z:0,jump:false,grab:false,actions:{jump:2}}]});
 const batched=await host.wait('input',m=>!!m.commands);assert.equal(batched.commands.length,2);assert.equal(batched.slot,1);assert.equal(batched.commands[0].actions.jump,2,'short jump tap preserved in command batch');
 const token=peers[1].token;peers[1].ws.close();await host.wait('room',m=>m.room.running&&m.room.match===started.room.match&&m.room.members[2].reserved&&m.room.members[2].human===false);
 const resumed=await client();resumed.send({type:'join',code,token,name:'Friend 2'});assert.equal((await resumed.wait('joined')).slot,2);const rejoined=(await resumed.wait('state')).state;assert.equal(new SnapshotDecoder().decode(rejoined).surfaces.length,103,'rejoin receives full metadata even after delta frames');
 host.send({type:'lobby'});await peers[0].wait('room',m=>!m.room.running);extra.send({type:'join',code,name:'Full again'});assert.match((await extra.wait('error')).message,/已滿/);
 host.ws.close();assert.match((await peers[0].wait('closed')).reason,/房主/);
 const a=await client(),b=await client();a.send({type:'create',capacity:6,name:'A'});b.send({type:'create',capacity:6,name:'B'});const ra=await a.wait('joined'),rb=await b.wait('joined');assert.notEqual(ra.room.code,rb.room.code);
 assert.equal(ra.room.members.length,6);assert.equal(rb.room.members.filter(m=>!m.human).length,5);
 console.log('PASS: real WebSocket server, 10-player room, capacity/AI fill, host authorization, socket identity, snapshot relay, running-room admission, AI takeover/reconnect, room isolation and host close');
}finally{for(const ws of connections)ws.terminate();await app.close();}
