export const JUMP={speed:9.8,takeoffScale:.88,reboundSpeed:3.5,releaseScale:.82,holdSeconds:.18,edgeGraceSeconds:.12,bufferSeconds:.12};
export function beginJump(p,reboundInput=null,mobility=1){
 if(reboundInput){
  // Replace the previous flight velocity with the requested rebound direction.
  // No direction input produces a vertical jump; fresh support carry is added later.
  const length=Math.hypot(reboundInput.x,reboundInput.z);
  const speed=length>.01?JUMP.reboundSpeed*Math.max(0,Math.min(1,mobility))/length:0;
  p.vx=reboundInput.x*speed;p.vz=reboundInput.z*speed;
 }else{p.vx*=JUMP.takeoffScale;p.vz*=JUMP.takeoffScale;}
 p.vy=JUMP.speed;p.jumpActive=true;p.jumpAge=0;p.airTime=0;p.jumpGrace=0;p.jumpSupport=null;p.jumpBuffer=0;
}
export function updateJump(p,dt,held=true){
 if(!p.jumpActive)return;
 if(p.ground||p.vy<=0||p.downTime>0||p.getUpTime>0||p.diving){p.jumpActive=false;return;}
 if(!held&&p.jumpAge<JUMP.holdSeconds){p.vy*=JUMP.releaseScale;p.jumpActive=false;}
 p.jumpAge+=dt;if(p.jumpAge>=JUMP.holdSeconds)p.jumpActive=false;
}
