import {run} from './harness.mjs';
run(`
 const s=players[0].mesh.userData.animal;players[0].mesh.updateMatrixWorld(true);
 const headBox=new T.Box3();let n=0;
 s.animal.traverse(m=>{if(!m.isSkinnedMesh||m.name==='Ears')return;const {position,skinWeight,skinIndex}=m.geometry.attributes;
 for(let i=0;i<position.count;i++){let weight=0;for(let j=0;j<4;j++)if(m.skeleton.bones[skinIndex.getComponent(i,j)].name==='Head')weight+=skinWeight.getComponent(i,j);if(weight<.85)continue;const v=new T.Vector3().fromBufferAttribute(position,i);m.applyBoneTransform(i,v);m.localToWorld(v);headBox.expandByPoint(v);n++;}});
 console.log('HEAD',n,headBox.getCenter(new T.Vector3()).toArray(),headBox.getSize(new T.Vector3()).toArray(),'anchor',s.bones.get('Head').getWorldPosition(new T.Vector3()).toArray());
`);
