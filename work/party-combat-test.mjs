import {run} from './harness.mjs';
run(`
 clean();makeMap();resetPlayers(10);phase='race';
 for(let i=0;i<64&&!route(surfaces[0],players[0]).includes(goalSurface());i++){
   const pos=suggest('platform');if(!legal(pos,'platform'))break;
   addSurface('platform',pos.x,pos.z,pos.y);
 }
 spawn();raceTime=0;let strikes=0;
 for(let frame=0;frame<105*60;frame++){
   raceTime+=1/60;
   updateGrabs(players,1/60,punchBlocked);
   for(const p of players)if(p.alive&&!p.finished){move(p,1/60,bot(p,1/60));aiPunch(p);}
   resolvePlayerContacts(players,1/60);
   updateCombat(players,1/60,()=>strikes++,punchBlocked);
   assert(players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),'10-player simulation remains finite');
   if(players.every(p=>!p.alive||p.finished))break;
 }
 const finishers=players.filter(p=>p.finished).length;
 assert(finishers>0,'AI can complete a connected route while combat and player contacts are active');
 console.log('PASS: 10-player collision/combat simulation, finishers='+finishers+', punches landed='+strikes);
`);
