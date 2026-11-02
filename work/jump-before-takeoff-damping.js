export const JUMP={speed:9.8,releaseScale:.82,holdSeconds:.18};
export function beginJump(p){p.vy=JUMP.speed;p.jumpActive=true;p.jumpAge=0;}
export function updateJump(p,dt,held=true){
 if(!p.jumpActive)return;
 if(p.ground||p.vy<=0||p.downTime>0||p.getUpTime>0||p.diving){p.jumpActive=false;return;}
 if(!held&&p.jumpAge<JUMP.holdSeconds){p.vy*=JUMP.releaseScale;p.jumpActive=false;}
 p.jumpAge+=dt;if(p.jumpAge>=JUMP.holdSeconds)p.jumpActive=false;
}
