import {run} from './harness.mjs';
run(`
 $('count').value='8';practice();
 for(let n=0;n<5;n++){
   const h=players[0],b=players[1];testRagdoll();
   startGrab(h,players,h.facing,punchBlocked);grabHeld=true;
   for(let i=0;i<240;i++){
     keys.KeyW=i>=60&&i<90;
     tick(last+1000/60);
     if(i%30===0)console.log(n,i,'holder',h.x.toFixed(2),h.z.toFixed(2),'body',b.x.toFixed(2),b.y.toFixed(2),b.z.toFixed(2),'down',b.downTime.toFixed(1),'grip',h.grabbing,'contacts',b.ragdoll?.contacts);
   }
   stopGrabInput();keys={};
 }
`);
