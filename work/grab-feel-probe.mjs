import {run} from './harness.mjs';run(`
 clean();const floor=addSurface('platform',0,0,0,0,180,80,true);resetPlayers(6);phase='race';const h=players[0],p=players[1];players.slice(2).forEach(p=>p.alive=false);
 for(const [q,x] of [[h,0],[p,1.2]]){resetCombat(q);Object.assign(q,{x,y:0,z:0,vx:0,vz:0,vy:0,ground:floor,facing:0,jumpCD:0});}
 startGrab(h,players);for(let i=0;i<60;i++){updateGrabs(players,1/60);move(h,1/60,{x:-1,z:0,jump:false});move(p,1/60,{x:0,z:0,jump:false});updateCombat(players,1/60);}
 const gripGap=p.x-h.x,impulse=p.impulseX,old=p.x;releaseGrab(h,players);for(let i=0;i<60;i++)move(p,1/60,{x:0,z:0,jump:false});console.log({gap:gripGap,impulse,releaseDrift:p.x-old});
`);