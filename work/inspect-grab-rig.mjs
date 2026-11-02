import {run} from './harness.mjs'; run(`
 const p=players[0],s=p.mesh.userData.animal;p.mesh.position.set(0,0,0);p.mesh.rotation.set(0,0,0);s.mixer.update(0);p.mesh.updateMatrixWorld(true);
 for(const name of ['Root','Body','Hips','UpperLegL','LowerLegL','FootL','UpperLegR','LowerLegR','FootR']) { const b=s.bones.get(name); console.log(name,b.parent.name,b.position.toArray(),b.getWorldPosition(new T.Vector3()).toArray()); }
`);