import {run} from './harness.mjs';
run(`
const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
for(const count of [6,10]){
 clean();makeMap(0);resetPlayers(count);phase='race';raceTime=2;round=1;
 for(let i=0;i<20;i++)addSurface('platform',12+i*3,20,2);
 players.forEach((p,i)=>{p.vx=7;p.x=i*.83;p.y=.002;p.z=0;p.facing=.1*i;p.mesh.position.set(p.x,p.y,p.z);animateAnimal(p,1/60);});
 const snapshot=networkSnapshot();snapshot.match=1;snapshot.seq=1;
 const legacy={...snapshot,players:snapshot.players.map((data,i)=>{const rig=players[i].mesh.userData.animal;return {...data,pose:{pivot:poseOf(rig.bodyPivot),bones:[...rig.bones.values()].map(b=>[...b.position.toArray(),...b.quaternion.toArray()].map(rounded)),label:2.4}};})};
 const encoder=new netcode.SnapshotEncoder(),key=encoder.encode(snapshot);encoder.committed(key);snapshot.seq++;
 const packet=bytes({type:'state',state:encoder.encode(snapshot)}),before=bytes({type:'state',state:legacy});
 console.log(JSON.stringify({players:count,surfaces:surfaces.length,legacyPacketBytes:before,steadyPacketBytes:packet,reductionPercent:Math.round((1-packet/before)*100),at20HzMbps:Number((packet*20*8/1e6).toFixed(2))}));
}
// A constant-speed body rendered at 60 FPS from ideal 20 Hz snapshots.
// These are the same target-following formulas as guestFrame/renderFrame.
const dt=1/60,actorBlend=1-Math.exp(-25*dt),cameraBlend=1-Math.exp(-12*dt);
let latest=0,actor=0,cam=0;const relative=[],velocity=[];
for(let frame=0;frame<360;frame++){
 if(frame%3===0)latest=7*frame*dt;
 const oldActor=actor;actor+=(latest-actor)*actorBlend;cam+=(latest-cam)*cameraBlend;
 if(frame>120){relative.push(actor-cam);velocity.push((actor-oldActor)/dt);}
}
console.log(JSON.stringify({ideal20Hz:true,render60Hz:true,groundSpeed:7,displayedSpeedMin:Math.min(...velocity),displayedSpeedMax:Math.max(...velocity),actorCameraRelativeOscillationMetres:Math.max(...relative)-Math.min(...relative)}));
`);
