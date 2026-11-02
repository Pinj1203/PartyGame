import * as T from './three.module.js';

export const WAVE={radius:18,speed:3.2,tube:.035};
export function createWaveMesh(){
 const geometry=new T.TorusGeometry(1,WAVE.tube,6,80),attribute=geometry.attributes.position;
 const radial=new Float32Array(attribute.count*3);
 for(let i=0;i<attribute.count;i++){const x=attribute.getX(i),y=attribute.getY(i),length=Math.hypot(x,y);radial[i*3]=x/length;radial[i*3+1]=y/length;radial[i*3+2]=length-1;}
 const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xb4a0ff,emissive:0x8d68ff,emissiveIntensity:1,transparent:true,depthWrite:false}));
 mesh.rotation.x=Math.PI/2;mesh.userData.radial=radial;return mesh;
}
export function setWaveRadius(mesh,radius){
 const attribute=mesh.geometry.attributes.position,radial=mesh.userData.radial;
 // Grow the centre-line, preserving a 7 cm tube instead of scaling its thickness.
 for(let i=0;i<attribute.count;i++){const r=radius+radial[i*3+2];attribute.setXY(i,radial[i*3]*r,radial[i*3+1]*r);}
 attribute.needsUpdate=true;mesh.geometry.boundingSphere=new T.Sphere(new T.Vector3(),radius+WAVE.tube);
 mesh.material.opacity=Math.min(1,(WAVE.radius-radius)/2);
}
