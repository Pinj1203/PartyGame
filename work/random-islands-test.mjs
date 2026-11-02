import assert from 'node:assert/strict';
import {generateIslands} from '../dist/island-map.js';
import {run} from './harness.mjs';
const counts=new Set(),widths=new Set(),thickness=new Set();let descents=0;
for(let seed=0;seed<300;seed++){
 const layout=generateIslands(seed);assert.deepEqual(layout,generateIslands(seed));
 assert(layout.length>=2&&layout.length<=3);counts.add(layout.length);
 assert.equal(layout[0].x,0);assert.equal(layout.at(-1).x,80);assert.equal(layout.at(-1).y,2);
 for(const s of layout){assert(Object.values(s).every(Number.isFinite));assert(s.w>=7&&s.w<=13.5&&s.d>=9&&s.h>=.8);assert(s.y>=0&&s.y<=6);widths.add(Math.floor(s.w));thickness.add(Math.floor(s.h));}
 const primary=layout.toSorted((a,b)=>a.routeIndex-b.routeIndex);
 for(let i=1;i<primary.length;i++){
  const a=primary[i-1],b=primary[i],gap=b.x-a.x-(a.w+b.w)/2,dy=b.y-a.y;
  assert(gap>10,'island spacing is independent of normal jump reach');if(dy<-.2)descents++;
 }
 for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){const a=layout[i],b=layout[j];assert(!(Math.abs(a.x-b.x)<(a.w+b.w)/2-.02&&Math.abs(a.z-b.z)<(a.d+b.d)/2-.02&&a.y-a.h<b.y-.02&&a.y>b.y-b.h+.02),'no overlapping solids');}
}
assert.equal(counts.size,2);assert(widths.size>=5&&thickness.size>=6&&descents>10);
run(`
 for(let seed=0;seed<24;seed++){
  clean();makeMap(seed);resetPlayers(6);phase='race';raceTime=0;expert=true;
  const p=players[1],goal=goalSurface();assert.equal(goal.x,80);assert.equal(goal.routeIndex,surfaces.length-1);
  assert.equal(route(surfaces[0],p).length,0,'initial route needs construction: '+seed);
  for(let i=0;i<64&&!route(surfaces[0],p).includes(goal);i++){
   const pos=suggest('platform');assert(legal(pos,'platform'));addSurface('platform',pos.x,pos.z,pos.y);
  }
  assert.equal(goalSurface(),goal,'player construction never changes the finish island');
  assert.equal(route(surfaces[0],p).at(-1),goal,'a constructed bridge reaches the finish: '+seed);
  Object.assign(p,{x:goal.x+1.5,z:0,y:goal.y+.002,vx:0,vz:0,vy:0,ground:goal});
  move(p,1/60,{x:0,z:0,jump:false});assert(p.finished&&finishOrder.includes(p.i),'finish scoring works with either initial island count');
 }
 $('count').value='6';clean();makeMap(42);resetPlayers(6);const seed=mapSeed,layout=surfaces.map(s=>[s.x,s.y,s.z,s.designWidth,s.designDepth,s.designHeight]);
 start();assert.equal(mapSeed,seed);assert.deepEqual(surfaces.map(s=>[s.x,s.y,s.z,s.designWidth,s.designDepth,s.designHeight]),layout);
 const added=addSurface('platform',15,40,35);beginRound();assert.equal(mapSeed,seed);assert(surfaces.includes(added));
 const tall=surfaces.find(s=>s.fixed&&s.designHeight>4);assert(tall);const q=bounds(tall);assert(Math.abs(q.minY-(tall.y-tall.designHeight))<.001);
 const side=new T.Vector3(tall.x+tall.designWidth/2+.2,tall.y-tall.designHeight/2,tall.z);
 assert(collisionWorld.sphere(side,.36).some(h=>Math.abs(h.normal.x)>.8));
 const below=new T.Vector3(tall.x,tall.y-tall.designHeight-.2,tall.z);assert(collisionWorld.sphere(below,.36).some(h=>h.normal.y<-.8));
 console.log('PASS: 300 sparse 2/3-island layouts, 80m course, unrestricted gaps, constructed-route planning on 24 layouts, stable finish identity/scoring, persistence and precise collision');
`);
