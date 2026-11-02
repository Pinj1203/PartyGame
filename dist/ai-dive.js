import {JUMP} from './jump.js';
import {launchDive} from './dive.js';
import {ICE} from './ice.js';
import {WAVE} from './waves.js';
import * as T from './three.module.js';

// Conservative jump/dive forecasts. Only broad, stationary platform tops are
// accepted; the real controller still performs every movement and collision.
export class DivePlanner {
  constructor(world) { this.world=world;this.links=new WeakMap(); }
  steer(p,target) {
    const x=target.x-p.x,z=target.z-p.z,length=Math.hypot(x,z);
    const scale=Math.min(3/7,1/(length||1));
    return {x:x*scale,z:z*scale,jump:false};
  }
  local(s,x,z) {
    const dx=x-s.x,dz=z-s.z,c=Math.cos(s.angle),n=Math.sin(s.angle);
    return {x:dx*c-dz*n,z:dx*n+dz*c};
  }
  safeLanding(target,p) {
    if(target.type!=='platform')return null;
    const angle=p.facing+target.angle;
    // Reserve the whole prone body, uncertainty, and the full braking slide.
    const mx=.5+.365*Math.abs(Math.cos(angle)),mz=.5+.365*Math.abs(Math.sin(angle));
    const response=target.frozen?ICE.groundResponse:this.world.motion.groundResponse;
    const stop={x:p.x+p.vx/response,z:p.z+p.vz/response};
    let margin=Infinity;
    for(const point of [p,stop]){
      const l=this.local(target,point.x,point.z);
      margin=Math.min(margin,target.designWidth/2-Math.abs(l.x)-mx,target.designDepth/2-Math.abs(l.z)-mz);
    }
    return margin>=.08?{stop,margin}:null;
  }
  predict(p,target,delay=Infinity) {
    if(target.type!=='platform')return null;
    const {motion,dive,height}=this.world,h=1/60,landingY=height(target);
    const q={x:p.x,y:p.y,z:p.z,vx:p.vx,vz:p.vz,vy:p.vy,facing:p.facing,
      impulseX:p.impulseX||0,impulseZ:p.impulseZ||0,diving:false,divePose:0};
    const path=[],speed=p.speed??7;
    for(let i=0;i<108;i++){
      const time=i*h,previousY=q.y;
      if(!q.diving&&time+1e-6>=delay){
        launchDive(q,dive);q.diving=true;
      }
      if(q.diving)q.divePose=Math.min(1,q.divePose+h/dive.poseSeconds);
      else{
        const input=this.steer(q,target),dx=input.x*speed-q.vx,dz=input.z*speed-q.vz;
        const fraction=Math.min(1,motion.airAcceleration*h/(Math.hypot(dx,dz)||1));
        q.vx+=dx*fraction;q.vz+=dz*fraction;
        if(Math.hypot(input.x,input.z)>.1){
          const angle=Math.atan2(input.z,input.x)-q.facing,delta=Math.atan2(Math.sin(angle),Math.cos(angle));
          q.facing+=T.MathUtils.clamp(delta*(1-Math.exp(-motion.turnResponse*h)),-motion.maxTurnSpeed*h,motion.maxTurnSpeed*h);
        }
      }
      const decay=Math.exp(-4.5*h),travel=(1-decay)/4.5;
      q.vy-=22*h;q.x+=q.vx*h+q.impulseX*travel;q.z+=q.vz*h+q.impulseZ*travel;q.y+=q.vy*h;
      q.impulseX*=decay;q.impulseZ*=decay;
      path.push({...q,time:time+h});
      if(q.vy<0&&previousY>=landingY&&q.y<=landingY){
        const landing={...q,y:landingY},safe=this.safeLanding(target,landing);
        if(!safe||(!q.diving&&Number.isFinite(delay))||q.vy<-15)return null;
        return {target,delay,path,landing,...safe,time:time+h};
      }
      if(q.y<landingY-1&&q.vy<0)return null;
    }
    return null;
  }
  clear(prediction,origin=null,dynamic=false) {
    if(!prediction)return false;
    const {surfaces,collision,players,shots,waves}=this.world;
    const end=prediction.stop,y=prediction.landing.y;
    if(collision.capsule(new T.Vector3(end.x,y+.363,end.z),new T.Vector3(end.x,y+1.093,end.z),.36,1).length)return false;
    for(const p of prediction.path){
      const tilt=p.divePose*1.45,reach=.365*Math.sin(tilt),fx=Math.cos(p.facing),fz=Math.sin(p.facing);
      const a=new T.Vector3(p.x-fx*reach,p.y+.36,p.z-fz*reach);
      const b=new T.Vector3(p.x+fx*reach,p.y+.36+.73*Math.cos(tilt),p.z+fz*reach);
      for(const hit of collision.capsule(a,b,.36,1)){
        if(hit.normal.y>=.85&&(hit.surface===prediction.target||(hit.surface===origin&&p.time<.08)))continue;
        return false;
      }
      // Avoid devices whose forces or timing would invalidate a ballistic plan.
      for(const s of surfaces()){
        const l=this.local(s,p.x,p.z);
        if(s.type==='fan'&&l.x>-.2&&l.x<8.7&&Math.abs(l.z)<2.4&&p.y<s.y+3.5&&p.y>s.y-1.2)return false;
        if(s.type==='field'&&Math.hypot(l.x,l.z)<WAVE.radius+.7&&p.y<s.y+.85&&p.y+1.45>s.y-.1)return false;
        if(s.type==='spike'&&Math.abs(l.x)<1.85&&Math.abs(l.z)<1.85&&p.y<s.y+1.3&&p.y+1.4>s.y)return false;
      }
      if(dynamic){
        for(const shot of shots()){
          if(shot.spent)continue;
          if(Math.hypot(p.x-shot.mesh.position.x-shot.dx*p.time,p.z-shot.mesh.position.z-shot.dz*p.time)<1&&
            Math.abs(p.y+.6-shot.mesh.position.y)<1.1)return false;
        }
        for(const wave of waves())if(Math.abs(Math.hypot(p.x-wave.x,p.z-wave.z)-(wave.r+WAVE.speed*p.time))<.65&&p.y<wave.y+.7)return false;
      }
    }
    if(dynamic){
      const end=prediction.stop;
      for(const other of players()){
        if(other===prediction.actor||!other.alive||other.finished)continue;
        if(Math.abs(other.y-prediction.landing.y)>1.5)continue;
        const t=Math.min(.4,prediction.time);
        if(Math.hypot(end.x-other.x-other.vx*t,end.z-other.z-other.vz*t)<1.25)return false;
      }
    }
    return true;
  }
  choose(p,target,delays,origin=null,dynamic=false) {
    const options=delays.map(delay=>this.predict(p,target,delay)).filter(Boolean)
      .sort((a,b)=>b.margin-a.margin);
    for(const option of options){option.actor=p.actor??p;if(this.clear(option,origin,dynamic))return option;}
    return null;
  }
  launch(p,target,speed) {
    const input=this.steer(p,target),decay=Math.exp(-(p.ground?.frozen?ICE.groundResponse:this.world.motion.groundResponse)/60);
    return {...p,actor:p,speed,vy:JUMP.speed,
      vx:(p.vx*decay+input.x*speed*(1-decay))*JUMP.takeoffScale,vz:(p.vz*decay+input.z*speed*(1-decay))*JUMP.takeoffScale};
  }
  link(a,b,speed=7) {
    if(a.type!=='platform'||b.type!=='platform'||a===b)return null;
    const dy=this.world.height(b)-this.world.height(a);
    if(dy>1.8||dy<-3.5||Math.hypot(a.x-b.x,a.z-b.z)>Math.hypot(a.designWidth,a.designDepth)+Math.hypot(b.designWidth,b.designDepth)+12)return null;
    let links=this.links.get(a);if(!links)this.links.set(a,links=new Map());
    const key=b,version=this.world.surfaces().length+':'+this.world.surfaces().filter(s=>s.frozen).length;
    const cached=links.get(key);
    if(cached?.version===version&&cached.speed===speed)return cached.value;
    const yaw=Math.atan2(b.z-a.z,b.x-a.x),fx=Math.cos(yaw),fz=Math.sin(yaw);
    const localYaw=yaw+a.angle;
    const run=Math.min((a.designWidth/2-.85)/Math.max(.001,Math.abs(Math.cos(localYaw))),
      (a.designDepth/2-.85)/Math.max(.001,Math.abs(Math.sin(localYaw))));
    let value=null;
    if(run>.4){
      const takeoff={x:a.x+fx*run,z:a.z+fz*run,y:this.world.height(a)+.002};
      const seed={...takeoff,vx:fx*speed*JUMP.takeoffScale,vz:fz*speed*JUMP.takeoffScale,vy:JUMP.speed,facing:yaw,speed};
      const option=this.choose(seed,b,[.16,.24,.32,.4,.48],a);
      if(option)value={...option,takeoff,yaw,origin:a};
    }
    links.set(key,{version,speed,value});return value;
  }
}
