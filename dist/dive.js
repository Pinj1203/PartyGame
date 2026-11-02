// One launch model for players, guest prediction, and AI landing forecasts.
export const DIVE={minSpeed:8,maxSpeed:11,boost:3.5,speedScale:1.1,launchAngle:10*Math.PI/180,poseSeconds:.12,recoverySeconds:.3};
export function launchDive(p,dive=DIVE){
 const fx=Math.cos(p.facing),fz=Math.sin(p.facing);
 const forward=Math.min(dive.maxSpeed,Math.max(dive.minSpeed,p.vx*fx+p.vz*fz+dive.boost))*dive.speedScale;
 const side=(-p.vx*fz+p.vz*fx)*.25;
 p.vx=fx*forward-fz*side;p.vz=fz*forward+fx*side;
 // Set the launch pitch once; gravity and limited air steering resume normally.
 p.vy=forward*Math.tan(dive.launchAngle);
}
