import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const source = readFileSync(new URL('../lib/tension.ts', import.meta.url), 'utf8');
const groups = [...source.matchAll(/\["([a-z_]+)", "[^"]+", "#[a-f0-9]+"\]/g)].map(m => m[1]);
const definitions = source.split('export const muscleRegions:')[1].split('// Store only')[0];
const regions = new Map([...definitions.matchAll(/  (\w+): \[([\s\S]*?)\]/g)].map(m => [m[1], [...m[2].matchAll(/id: "([^"]+)"/g)].map(r => r[1])]));
const report=[];
for (const mode of ['muscles', 'regions']) {
  const bytes=readFileSync(new URL(`../public/models/anatomy-${mode}.glb`, import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const surfaces=new Map(); let triangles=0;
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    const {position,normal}=object.geometry.attributes;
    assert.ok(position.count>0 && [...position.array].every(Number.isFinite),object.name+' invalid positions');
    assert.ok(normal && normal.count===position.count && [...normal.array].every(Number.isFinite),object.name+' invalid normals');
    assert.ok([...object.geometry.index.array].every(i=>i<position.count),object.name+' invalid indices');
    triangles+=object.geometry.index.count/3;
    if(object.userData.kind==='surface') {
      assert.ok(object.userData.sourceId,object.name+' missing provenance');
      assert.ok(!surfaces.has(object.userData.area), 'Duplicate area '+object.userData.area);
      surfaces.set(object.userData.area,object);
    }
  });
  const expected=mode==='muscles'?groups:groups.flatMap(g=>regions.has(g)?regions.get(g).map(r=>g+':'+r):[g]);
  assert.deepEqual([...surfaces.keys()].sort(),expected.sort());
  for (const [id,mesh] of surfaces) {
    if (id==='biceps' || id.startsWith('biceps:')) {
      const armBounds=new Box3().setFromObject(mesh);
      assert.ok(armBounds.min.y>1.06 && armBounds.max.y<1.43,id+' extends outside the upper arm');
    }
  }
  const bounds=new Box3().setFromObject(gltf.scene), height=bounds.max.y-bounds.min.y;
  assert.ok(height>1.70 && height<1.76,'Source scale changed');
  assert.ok(triangles<900000,'Full anatomical model exceeds triangle budget');
  assert.ok(bytes.length<22*1048576,'Single full-model asset exceeds byte budget');
  if(mode==='regions') {
    for(const [a,b] of [['traps:upper','traps:middle'],['traps:middle','traps:lower'],['lats:upper','lats:lower'],['abs:upper','abs:lower'],['biceps:long','biceps:short']]) {
      const first=surfaces.get(a).geometry, second=surfaces.get(b).geometry;
      const key=(p,i)=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(6)).join(',');
      const points=new Map();
      for(let i=0;i<first.attributes.position.count;i++)points.set(key(first.attributes.position,i),i);
      let shared=0;
      for(let j=0;j<second.attributes.position.count;j++) {
        const i=points.get(key(second.attributes.position,j)); if(i===undefined)continue;
        const n=first.attributes.normal,m=second.attributes.normal;
        assert.ok(n.getX(i)*m.getX(j)+n.getY(i)*m.getY(j)+n.getZ(i)*m.getZ(j)>.99,a+' shading seam');
        shared++;
      }
      assert.ok(shared>10,a+' disconnected from '+b);
    }
  }
  report.push({mode,areas:surfaces.size,triangles,height,megabytes:bytes.length/1048576});
}
writeFileSync(new URL('../../assets/anatomy/validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('PASS: anatomy IDs, provenance, finite mesh attributes, indices, shared head seams, scale and asset budgets.');
console.log(JSON.stringify(report,null,2));
