import * as T from './three.module.js';

export const ICE={radius:2.25,groundResponse:.7,impulseDrag:.6,contactDrag:.35};

// Use the same sphere/solid intersection for preview and committed placement.
// Testing individual meshes avoids freezing empty space inside a mechanism's sweep.
export function iceTargets(surfaces,point){
 const center=new T.Vector3(point.x,point.y,point.z),box=new T.Box3();
 return surfaces.filter(s=>!s.frozen&&s.mesh.userData.solids.some(m=>box.setFromObject(m).distanceToPoint(center)<=ICE.radius));
}

function frostTexture(){
 const size=128,data=new Uint8Array(size*size*4),seeds=[];
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)seeds.push([(x+.5+.28*Math.sin(x*17+y*23))*32,(y+.5+.28*Math.cos(x*31+y*13))*32]);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let first=Infinity,second=Infinity;
  for(const s of seeds){const dx=Math.min(Math.abs(x-s[0]),size-Math.abs(x-s[0])),dy=Math.min(Math.abs(y-s[1]),size-Math.abs(y-s[1])),d=Math.hypot(dx,dy);if(d<first){second=first;first=d;}else if(d<second)second=d;}
  const crack=Math.exp(-Math.pow((second-first)/.9,2)),grain=(Math.sin(x*91.7+y*35.3)*43758.5453)%1;
  const i=(y*size+x)*4;data[i]=120+crack*110+grain*6;data[i+1]=192+crack*60+grain*4;data[i+2]=230+crack*25;data[i+3]=255;
 }
 const texture=new T.DataTexture(data,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;
 texture.repeat.set(2,2);texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;
 return texture;
}

export function freezeSurface(surface){
 if(surface.frozen)return false;
 surface.frozen=true;
 const texture=frostTexture(),old=new Set();
 surface.mesh.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.effect)return;
  for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])old.add(m);
  mesh.material=new T.MeshPhysicalMaterial({color:0xc3edff,map:texture,bumpMap:texture,bumpScale:.045,
   roughness:.16,metalness:.05,clearcoat:1,clearcoatRoughness:.12,emissive:0x17374b,emissiveIntensity:.16});
 });
 for(const material of old){material.map?.dispose();material.dispose();}
 return true;
}

export function createIcePreview(){
 const group=new T.Group();group.userData.icePreview=true;
 const ball=new T.Mesh(new T.SphereGeometry(ICE.radius,40,24),new T.MeshBasicMaterial({color:0x97e7ff,transparent:true,opacity:.075,depthWrite:false,side:T.DoubleSide}));group.add(ball);
 const lineMaterial=new T.MeshBasicMaterial({color:0x98eeff,transparent:true,opacity:.85,depthWrite:false});
 for(let i=0;i<3;i++){const ring=new T.Mesh(new T.TorusGeometry(ICE.radius,.04,5,96),lineMaterial);if(i===1)ring.rotation.x=Math.PI/2;if(i===2)ring.rotation.y=Math.PI/2;group.add(ring);}
 const core=new T.Mesh(new T.IcosahedronGeometry(.48,1),new T.MeshStandardMaterial({color:0xd0f5ff,roughness:.15,emissive:0x55bbee,emissiveIntensity:.5}));group.add(core);
 group.userData.highlights=new Map();return group;
}

export function updateIcePreview(group,targets,point,valid){
 const highlights=group.userData.highlights,ids=new Set(targets.map(s=>s.id));
 for(const [id,helper] of highlights)if(!ids.has(id)){group.remove(helper);helper.geometry.dispose();helper.material.dispose();highlights.delete(id);}
 const origin=new T.Vector3(point.x,point.y,point.z);
 for(const s of targets){let helper=highlights.get(s.id);if(!helper){helper=new T.Box3Helper(new T.Box3(),0xe7faff);helper.material.transparent=true;helper.material.opacity=.8;helper.material.depthWrite=false;group.add(helper);highlights.set(s.id,helper);}helper.box.copy(s.worldBounds).translate(origin.clone().negate());}
 for(const child of group.children)if(child.isMesh)child.material.color.setHex(valid?(child.material.opacity>.2?0x247db5:0x9deaff):0xd33c61);
}
