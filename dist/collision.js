import * as T from './three.module.js';

// Narrow phase uses the rendered solid triangles, including rotated side walls
// and undersides. Bounds only select candidates; they are never solid boxes.
const v = () => new T.Vector3();
const clamp = T.MathUtils.clamp;
const a = v(), b = v(), cp = v(), cq = v(), edgeA = v(), edgeB = v();
const d1 = v(), d2 = v(), r = v(), normal = v(), query = new T.Box3();
const ray = new T.Ray();

function segmentPair(p1, q1, p2, q2, out1, out2) {
  d1.subVectors(q1,p1);d2.subVectors(q2,p2);r.subVectors(p1,p2);
  const aa=d1.lengthSq(),ee=d2.lengthSq(),f=d2.dot(r);
  let s=0,t=0;
  if(aa<1e-12) t=ee?clamp(f/ee,0,1):0;
  else {
    const c=d1.dot(r);
    if(ee<1e-12)s=clamp(-c/aa,0,1);
    else {
      const bb=d1.dot(d2),den=aa*ee-bb*bb;
      s=den?clamp((bb*f-c*ee)/den,0,1):0;
      t=(bb*s+f)/ee;
      if(t<0){t=0;s=clamp(-c/aa,0,1);}
      else if(t>1){t=1;s=clamp((bb-c)/aa,0,1);}
    }
  }
  out1.copy(p1).addScaledVector(d1,s);out2.copy(p2).addScaledVector(d2,t);
}

function closest(tri, start, end) {
  tri.closestPointToPoint(start,cq);cp.copy(start);
  let best=cp.distanceToSquared(cq);
  tri.closestPointToPoint(end,edgeB);
  if(end.distanceToSquared(edgeB)<best){cp.copy(end);cq.copy(edgeB);best=cp.distanceToSquared(cq);}
  for(let edge=0;edge<3;edge++){
    const x=edge===0?tri.a:edge===1?tri.b:tri.c,y=edge===0?tri.b:edge===1?tri.c:tri.a;
    segmentPair(start,end,x,y,edgeA,edgeB);
    const ds=edgeA.distanceToSquared(edgeB);
    if(ds<best){best=ds;cp.copy(edgeA);cq.copy(edgeB);}
  }
  const length=edgeA.subVectors(end,start).length();
  if(length>1e-9){
    ray.set(start,edgeA.divideScalar(length));
    if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,edgeB)&&start.distanceTo(edgeB)<=length){
      cp.copy(edgeB);cq.copy(edgeB);best=0;
    }
  }
  return best;
}

export class CollisionWorld {
  constructor(){this.entries=new Map();}
  clear(){this.entries.clear();}
  update(surface){
    surface.mesh.updateMatrixWorld(true);
    const meshes=surface.mesh.userData.solids||[];
    let entries=this.entries.get(surface);
    if(!entries||entries.length!==meshes.length||entries.some((entry,i)=>entry.mesh!==meshes[i])){
      entries=meshes.map(mesh=>({mesh,bounds:new T.Box3(),matrix:new T.Matrix4(),triangles:null,dirty:true,initialized:false}));
      this.entries.set(surface,entries);
    }
    surface.worldBounds?.makeEmpty();
    for(const entry of entries){
      const mesh=entry.mesh,g=mesh.geometry,pos=g.attributes.position,index=g.index;
      const changed=entry.geometry!==g||entry.position!==pos||entry.index!==index||entry.positionVersion!==pos.version||entry.indexVersion!==index?.version;
      if(changed){
        entry.geometry=g;entry.position=pos;entry.index=index;entry.positionVersion=pos.version;entry.indexVersion=index?.version;entry.triangles=null;
        g.computeBoundingBox();
      }
      if(changed||!entry.initialized||!entry.matrix.equals(mesh.matrixWorld)){
        // Capture the physical transform: visual interpolation may move this mesh
        // again before the next collision query.
        entry.matrix.copy(mesh.matrixWorld);entry.bounds.copy(g.boundingBox).applyMatrix4(entry.matrix);
        entry.dirty=true;entry.initialized=true;
      }
      surface.worldBounds?.union(entry.bounds);
    }
  }
  prepare(entry,surface){
    if(!entry.dirty)return;
    if(!entry.triangles){
      const pos=entry.position,index=entry.index,count=index?index.count:pos.count;
      entry.triangles=[];
      for(let i=0;i<count;i+=3){
        const local=new T.Triangle();
        local.a.fromBufferAttribute(pos,index?index.getX(i):i);
        local.b.fromBufferAttribute(pos,index?index.getX(i+1):i+1);
        local.c.fromBufferAttribute(pos,index?index.getX(i+2):i+2);
        entry.triangles.push({local,tri:new T.Triangle(),bounds:new T.Box3(),normal:v(),surface,mesh:entry.mesh});
      }
    }
    for(const item of entry.triangles){
      const {tri,local,bounds}=item;
      tri.a.copy(local.a).applyMatrix4(entry.matrix);tri.b.copy(local.b).applyMatrix4(entry.matrix);tri.c.copy(local.c).applyMatrix4(entry.matrix);
      bounds.makeEmpty().expandByPoint(tri.a).expandByPoint(tri.b).expandByPoint(tri.c);tri.getNormal(item.normal);
    }
    entry.dirty=false;
  }
  candidates(start,end,radius){
    query.setFromPoints([start,end]).expandByScalar(radius+.002);
    const result=[];
    for(const [surface,meshes] of this.entries){
      if(surface.worldBounds&&!query.intersectsBox(surface.worldBounds))continue;
      for(const mesh of meshes)if(query.intersectsBox(mesh.bounds)){
        // Only nearby geometry needs world-space triangles; reuse them until its
        // physical transform changes. Replaying input no longer rebuilds a map.
        this.prepare(mesh,surface);
        for(const item of mesh.triangles)if(query.intersectsBox(item.bounds))result.push(item);
      }
    }
    return result;
  }
  // Solve one capsule. For a sphere start=end. Returns the contact normals
  // so both the controller and ragdoll can remove inward velocity.
  capsule(start,end,radius,iterations=3,ignore=null){
    const hits=[],candidates=this.candidates(start,end,radius).filter(item=>item.surface!==ignore);
    for(let pass=0;pass<iterations;pass++){
      let changed=false;
      for(const item of candidates){
        const distanceSq=closest(item.tri,start,end);
        if(distanceSq>=radius*radius)continue;
        const distance=Math.sqrt(distanceSq);
        normal.copy(cp).sub(cq);
        if(distance>1e-7)normal.divideScalar(distance);
        else normal.copy(item.normal);
        const depth=radius-distance+.0001;
        start.addScaledVector(normal,depth);end.addScaledVector(normal,depth);
        hits.push({normal:normal.clone(),point:cq.clone(),mesh:item.mesh,surface:item.surface,depth});
        changed=true;
      }
      if(!changed)break;
    }
    return hits;
  }
  sphere(position,radius,ignore=null){
    a.copy(position);b.copy(position);
    const hits=this.capsule(a,b,radius,2,ignore);
    position.copy(a);return hits;
  }
  sphereSupport(position,radius){
    const reach=radius+.006;
    let support=null;
    for(const item of this.candidates(position,position,reach)){
      if(item.normal.y<.5)continue;
      item.tri.closestPointToPoint(position,cp);
      normal.copy(position).sub(cp);
      const distanceSq=normal.lengthSq();
      // Check the final pose across the solver's skin gap. Only a real upward
      // face beneath this body part can support it, never a wall or underside.
      if(distanceSq>reach*reach||normal.y<=.001||normal.dot(item.normal)<=.001)continue;
      if(!support||distanceSq<support.distanceSq)support={surface:item.surface,point:cp.clone(),distanceSq};
    }
    return support;
  }
  flatSupport(position,radius,previousFootY){
    let support=null;
    const footprint=radius-.004;
    for(const item of this.candidates(position,position,radius)){
      // Use the actual face, not the capsule's radial contact normal at an edge.
      // Only horizontal tops get a flat foot; ramps keep their existing physics.
      if(item.normal.y<.99999)continue;
      item.tri.closestPointToPoint(position,cp);
      if(cp.y>previousFootY+.003||cp.y<position.y-.003)continue;
      if((cp.x-position.x)**2+(cp.z-position.z)**2>footprint*footprint)continue;
      if(!support||cp.y>support.height)support={surface:item.surface,mesh:item.mesh,height:cp.y,point:cp.clone()};
    }
    return support;
  }
  movePlayer(p,from,to,radius=.36,height=1.45){
    const canLand=p.vy<=.01;
    p.jumpSupportContact=null;
    p.mechanismContacts=[];p.surfaceContacts=[];const incoming=v().set(p.vx+p.impulseX+(p.grabVelocityX||0),p.vy,p.vz+p.impulseZ+(p.grabVelocityZ||0));
    // Tilt the capsule with the belly-first dive, including its swept nose/tail.
    const tilt=(p.divePose||0)*1.45,half=(height-2*radius)/2;
    const fx=Math.cos(p.diveYaw||0),fz=Math.sin(p.diveYaw||0);
    const reach=half*Math.sin(tilt);
    const low=v().set(-fx*reach,radius,-fz*reach);
    const high=v().set(fx*reach,radius+2*half*Math.cos(tilt),fz*reach);
    const delta=v().subVectors(to,from);
    const steps=Math.max(1,Math.ceil(delta.length()/.12));
    const position=from.clone(),step=delta.multiplyScalar(1/steps);
    const flatFoot=canLand&&tilt<.01;
    let ground=null;
    for(let n=0;n<steps;n++){
      ground=null;
      const previousFootY=position.y;
      position.add(step);
      const support=flatFoot?this.flatSupport(position,radius,previousFootY):null;
      const penetration=support?Math.max(0,support.height-position.y):0;
      if(support)position.y=support.height+.0001;
      a.copy(position).add(low);
      b.copy(position).add(high);
      const hits=this.capsule(a,b,radius);
      if(support)hits.unshift({normal:v().set(0,1,0),point:support.point,mesh:support.mesh,surface:support.surface,depth:penetration});
      position.copy(a).sub(low);
      for(const hit of hits){
        const n=hit.normal;
        p.surfaceContacts.push({...hit,velocity:incoming.clone()});
        if(hit.surface.mesh.userData.facility)p.mechanismContacts.push({...hit,velocity:incoming.clone()});
        if(n.y>=.5&&p.vy<=0)ground=hit.surface;
        const inward=step.dot(n);if(inward<0)step.addScaledVector(n,-inward);
        const speed=p.vx*n.x+p.vy*n.y+p.vz*n.z;
        if(speed<0){p.vx-=n.x*speed;p.vy-=n.y*speed;p.vz-=n.z*speed;}
        const impulse=p.impulseX*n.x+p.impulseZ*n.z;
        if(impulse<0){p.impulseX-=n.x*impulse;p.impulseZ-=n.z*impulse;}
      }
    }
    // Contact resolution leaves a tiny skin gap. Probe that gap at the FINAL
    // position so a fast landing is retained but walking off an edge isn't.
    ground=null;
    if(canLand){
      a.copy(position).add(low);a.y-=.003;
      b.copy(position).add(high);b.y-=.003;
      const contacts=this.capsule(a,b,radius,1);
      ground=(flatFoot?this.flatSupport(position,radius,position.y)?.surface:null)??contacts.find(hit=>hit.normal.y>=.5)?.surface??null;
      // A foot already below the lip can still jump from contact with its top,
      // without snapping the player up onto the platform through the side wall.
      // Vertical walls and undersides cannot grant a jump.
      p.jumpSupportContact=ground?.id??null;
      if(!ground){
        // Query upward-facing geometry independently: the side triangle may
        // already have resolved the shared edge and hidden its top contact.
        a.copy(position).add(low);const reach=radius+.006;
        for(const item of this.candidates(a,a,reach)){
          if(item.normal.y<.5)continue;
          item.tri.closestPointToPoint(a,cp);
          if(cp.y<a.y-.005&&cp.distanceToSquared(a)<=reach*reach){p.jumpSupportContact=item.surface.id;break;}
        }
      }
    }
    if(ground)p.vy=0; // Ground projection on a ramp must not become a new jump.
    p.x=position.x;p.y=position.y;p.z=position.z;
    return ground;
  }
  // A short grounded sweep removes overlap introduced by player-player pushes.
  depenetrate(p){
    const pos=v().set(p.x,p.y,p.z);
    this.movePlayer(p,pos,pos);
  }
}
