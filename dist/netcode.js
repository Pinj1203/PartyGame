// Wire order is versioned. Full actor state makes individual updates disposable;
// immutable scene data is sent separately and retained by the relay for rejoin.
export const NET_VERSION=2,STEP=1/60;
export const PLAYER_FIELDS=['x','y','z','vx','vy','vz','facing','alive','finished','score','delta','roundKnockouts','pick','built','punchCooldown','punchTime','punchSerial','hitSerial','hitFlash','lastImpactX','lastImpactZ','landingSpeed','downTime','getUpTime','pendingKnockdown','diving','diveRecovery','divePose','diveYaw','grabbedBy','grabbing','grabNeedsRelease','escapeProgress','grabFacingLocked','grabIntent','grabYaw','grabVelocityX','grabVelocityZ','ground','impulseX','impulseZ','stagger','jumpCD','jumpActive','jumpAge','jumpWasDown','diveUsed','airTime','attackYaw','hazardCooldown','netAck','jumpGrace','jumpSupport','jumpBuffer'];
const booleanFields=new Set(['alive','finished','built','pendingKnockdown','diving','grabNeedsRelease','grabFacingLocked','grabIntent','jumpActive','jumpWasDown','diveUsed']);
const q=n=>typeof n==='number'?Math.round(n*1000)/1000:n;
function quantize(value){if(Array.isArray(value))return value.map(quantize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,quantize(v)]));return q(value);}
export class SnapshotEncoder{
 constructor(){this.signature='';this.revision=0;this.sentRevision=0;}
 encode(s){
  const meta={mapSeed:s.mapSeed,expert:s.expert,selection:s.selection,title:s.title,hint:s.hint,result:s.result,surfaces:quantize(s.surfaces)};
  const signature=JSON.stringify(meta);if(signature!==this.signature){this.signature=signature;this.revision++;}
  const frame={version:NET_VERSION,match:s.match,seq:s.seq,phase:s.phase,round:s.round,remaining:q(s.remaining),raceTime:q(s.raceTime),sceneRevision:this.revision,finishOrder:s.finishOrder,
   players:s.players.map(p=>{const row={i:p.i,a:p.actionAck,v:PLAYER_FIELDS.map(k=>booleanFields.has(k)?+!!p[k]:q(p[k]??null))};if(p.pose)row.pose=quantize(p.pose);return row;}),
   shots:quantize(s.shots),waves:quantize(s.waves),facilityRocks:quantize(s.facilityRocks)};
  if(this.sentRevision!==this.revision)frame.meta=meta;
  return frame;
 }
 committed(frame){this.sentRevision=frame.sceneRevision;}
}
export class SnapshotDecoder{
 constructor(){this.meta=null;this.revision=0;this.match=null;}
 decode(s){
  if(s.version!==NET_VERSION)return s; // Also accepts uncompressed fixtures.
  if(this.match!==s.match){this.meta=null;this.revision=0;this.match=s.match;}
  if(s.meta){this.meta=s.meta;this.revision=s.sceneRevision;}
  if(!this.meta||this.revision!==s.sceneRevision)return null;
  return {...s,...this.meta,players:s.players.map(row=>{const p={i:row.i,pose:row.pose??null,actionAck:row.a};PLAYER_FIELDS.forEach((k,i)=>p[k]=booleanFields.has(k)?!!row.v[i]:row.v[i]);return p;})};
 }
}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const angle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
// Carry the fractional deadline forward instead of rounding every interval up
// to a render frame. A stalled tab sends one fresh packet, never a catch-up burst.
export class PacketCadence{
 constructor(period){this.period=period;this.next=null;}
 due(now){return this.next==null||now+.01>=this.next;}
 sent(now){if(!this.due(now))return;this.next=this.next==null?now+this.period:this.next+this.period;if(this.next<=now)this.next=now+this.period;}
}
export function interpolateActor(a,b,t){
 if(!a)return b;if(!b)return a;
 // Death/respawn and ragdoll transitions are discrete authoritative events.
 if(a.alive!==b.alive||a.finished!==b.finished)return t>=1?b:a;
 const p={...(t>=1?b:a)};
 for(const k of ['x','y','z','vx','vy','vz','punchTime','punchCooldown','downTime','getUpTime','divePose','diveRecovery','escapeProgress','grabVelocityX','grabVelocityZ']){
  if(typeof a[k]==='number'&&typeof b[k]==='number')p[k]=a[k]+(b[k]-a[k])*t;
 }
 if((a.downTime>0||a.getUpTime>0)!==(b.downTime>0||b.getUpTime>0)){p.downTime=t>=1?b.downTime:a.downTime;p.getUpTime=t>=1?b.getUpTime:a.getUpTime;}
 p.facing=angle(a.facing,b.facing,t);return p;
}
export class SnapshotTimeline{
 constructor(){this.reset();}
 reset(){this.frames=[];this.playTime=null;this.lastArrival=null;this.delay=.14;this.interval=.05;this.jitter=0;this.offsets=[];this.clockOffset=null;}
 push(s,now){
  const last=this.frames.at(-1);
  if(last&&(last.state.round!==s.round||last.state.phase!==s.phase||last.state.match!==s.match))this.reset();
  if(this.frames.at(-1)?.state.seq>=s.seq)return false;
  const previous=this.frames.at(-1);
  if(previous){
   const sentInterval=s.raceTime-previous.state.raceTime,arrivalInterval=now-previous.arrival;
   if(sentInterval>0){
    this.interval+=.1*(clamp(sentInterval,.025,.1)-this.interval);
    this.jitter+=.12*(Math.abs(arrivalInterval-sentInterval)-this.jitter);
    const target=clamp(this.interval*2+.04+this.jitter*2.5,.14,.24);
    this.delay+=(target-this.delay)*(target>this.delay?.3:.015);
   }
  }
  this.offsets.push(now-s.raceTime);if(this.offsets.length>60)this.offsets.shift();
  // A low arrival-time percentile rejects delayed packets without letting each
  // delivery nudge the scene clock. Slow drift follows host clock differences.
  const offsets=[...this.offsets].sort((a,b)=>a-b),offset=offsets[Math.floor((offsets.length-1)*.1)];
  this.clockOffset=this.clockOffset==null?offset:this.clockOffset+(offset-this.clockOffset)*.08;
  this.lastArrival=now;this.frames.push({state:s,arrival:now});if(this.frames.length>40)this.frames.shift();return true;
 }
 sample(dt,now){
  const newest=this.frames.at(-1);if(!newest)return null;
  const end=newest.state.raceTime,desired=now-this.clockOffset-this.delay;
  if(this.playTime==null)this.playTime=Math.min(end,Math.max(this.frames[0].state.raceTime-this.delay,desired));
  else this.playTime=Math.min(end,Math.max(this.playTime,this.playTime+dt*clamp(1+(desired-this.playTime-dt)*.9,.96,1.04)));
  let a=this.frames[0].state,b=a;
  for(const frame of this.frames){b=frame.state;if(b.raceTime>=this.playTime)break;a=b;}
  const alpha=a===b?0:clamp((this.playTime-a.raceTime)/(b.raceTime-a.raceTime||1),0,1);
  return {a,b,alpha,time:a.raceTime+(b.raceTime-a.raceTime)*alpha};
 }
}

// Predict only the local actor. Replay unacknowledged commands from each
// authoritative state; visual correction is independent of collision position.
export class LocalPredictor{
 constructor(step,reference=null){this.step=step;this.reference=reference;this.reset();}
 reset(){this.actor=null;this.previous=null;this.pending=[];this.sequence=0;this.time=0;this.accumulator=0;this.error={x:0,y:0,z:0};this.lastHit=null;}
 render(){
  if(!this.actor)return null;
  const state=interpolateActor(this.previous??this.actor,this.actor,clamp(this.accumulator/STEP,0,1));
  for(const k of ['x','y','z'])state[k]+=this.error[k];
  return state;
 }
 get renderTime(){return this.time-STEP+this.accumulator;}
 reconcile(state,time,makeActor,enabled=true){
  const old=this.actor,oldPrevious=this.previous,before=this.render(),referenceBefore=before&&this.reference?.(before,this.renderTime),ack=state.netAck||0;
  this.sequence=Math.max(this.sequence,ack);this.pending=this.pending.filter(c=>c.seq>ack);
  this.actor=makeActor(state);this.previous={...this.actor};this.time=time;
  if(enabled)for(const command of this.pending){this.previous={...this.actor};this.time+=STEP;this.step(this.actor,command,STEP,this.time);}
  const reset=!old||old.alive!==state.alive||old.finished!==state.finished||this.lastHit!==state.hitSerial||!enabled;
  // Preserve the previous tick when an acknowledgement consumes the entire
  // queue; otherwise a packet would temporarily flatten render interpolation.
  if(!reset&&!this.pending.length&&oldPrevious)for(const k of ['x','y','z','facing'])this.previous[k]+=oldPrevious[k]-old[k];
  this.error={x:0,y:0,z:0};
  if(!reset){
   const after=this.render(),referenceAfter=this.reference?.(after,this.renderTime);
   const sameReference=referenceBefore&&referenceAfter&&referenceBefore.key===referenceAfter.key;
   // Advancing/rewinding a moving support is not player error: reconcile in
   // support coordinates, then render the support and passenger on one clock.
   for(const k of ['x','y','z'])this.error[k]=before[k]-after[k]-(sameReference?referenceBefore[k]-referenceAfter[k]:0);
   if(Math.hypot(this.error.x,this.error.y,this.error.z)>2.5)this.error={x:0,y:0,z:0};
  }
  this.lastHit=state.hitSerial;
 }
 advance(dt,input,enabled=true){
  this.accumulator=Math.min(.1,this.accumulator+dt);const commands=[];
  while(this.accumulator>=STEP){
   this.accumulator-=STEP;
   const command={...input,actions:{...input.actions},seq:++this.sequence};this.pending.push(command);commands.push(command);this.time+=STEP;
   if(this.actor&&enabled){this.previous={...this.actor};this.step(this.actor,command,STEP,this.time);}
  }
  // Never replay seconds of stale movement after a suspended tab/connection.
  if(this.pending.length>120)this.pending.splice(0,this.pending.length-120);
  for(const k of ['x','y','z'])this.error[k]*=Math.exp(-dt*14);
  return commands;
 }
}
