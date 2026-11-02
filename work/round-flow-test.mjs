import {run} from './harness.mjs';
run(`
 $('count').value='6';start();const initialRound=round;
 selection=players.map(()=>({type:'platform',owner:null}));
 for(let i=0;i<players.length-1;i++)claim(players[i],i);assert.equal(phase,'draft');
 remaining=9;claim(players.at(-1),players.length-1);assert.equal(phase,'build');assert.equal(remaining,15,'last choice starts placement immediately');
 for(const p of players.slice(1))aiBuild(p);assert.equal(phase,'build','wait for unconfirmed human');
 aim={x:MAP.buildMaxX-1,y:30,z:40};remaining=11;placeHuman();assert.equal(phase,'race');assert.equal(remaining,MAP.raceSeconds);assert.equal(round,initialRound);
 const count=surfaces.length;placeHuman();advanceWhenReady();assert.equal(surfaces.length,count,'late duplicate placement cannot restart race');
 net={online:true,running:true,isHost:true,isGuest:false,slot:0,room:{members:players.map((p,i)=>({human:i<2}))}};
 players[0].alive=false;assert(!canSkipAIRound(),'one active human blocks host skip');
 players[1].alive=false;players[3].finished=true;finishOrder=[3];assert(canSkipAIRound());
 const score=players[3].score;assert(skipAIRound());assert.equal(phase,'draft');assert.equal(round,initialRound+1);assert.equal(players[3].score,score+4,'awards completed finishes before next round');
 assert(!skipAIRound());assert.equal(players[3].score,score+4,'double click cannot double score');
 phase='race';players[0].alive=false;players[1].finished=true;assert(canSkipAIRound(),'finished humans need not watch remaining AI');
 net.isHost=false;net.isGuest=true;assert(!canSkipAIRound());assert(!skipAIRound());assert.equal(phase,'race','guest cannot advance');
 net.isHost=true;net.isGuest=false;round=8;finishOrder=[];assert(skipAIRound());assert.equal(phase,'results');assert.equal(round,8,'last round shows final scores');
 net=null;practiceMode=true;phase='race';assert(!canSkipAIRound(),'practice has no round shortcut');
 console.log('PASS: instant full-party draft/build transitions, host-only AI skip, retained scoring, no duplicate transition and final-round guard');
`);

run(`
 const originalRandom=Math.random;
 try {
  for(let count=6;count<=10;count++){
   $('count').value=String(count);start();
   for(const roll of [.01,.5,.99]){
    Math.random=()=>roll;beginRound();
    assert.equal(selection.filter(s=>s.type==='platform').length,1+Math.floor(roll*3),'draft offers 1–3 ordinary platforms for every room size');
    assert.equal(selection.length,count+2,'every player still has an available item');
    assert(selection.some(s=>s.type==='ice')&&selection.some(s=>MOVING_TYPES.includes(s.type))&&selection.some(s=>FACILITY_TYPES.includes(s.type)),'guaranteed special items survive the smaller platform allotment');
   }
   Math.random=originalRandom;
  }
 } finally {Math.random=originalRandom;}
 console.log('PASS: 1–3 draft platforms, enough items and guaranteed specials in 6–10 player rooms');
`);
