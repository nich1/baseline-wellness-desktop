import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box3, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const folder = new URL('../../assets/mannequin/', import.meta.url);
const source = readFileSync(new URL('../lib/tension.ts', import.meta.url), 'utf8');
const muscles = [...source.matchAll(/\["([a-z_]+)", "[^"]+", "#[a-f0-9]+"\]/g)].map(match => match[1]);
const definitions = source.split('export const muscleRegions:')[1].split('// Store only')[0];
const regions = new Map([...definitions.matchAll(/  (\w+): \[([\s\S]*?)\]/g)].map(match => [match[1], [...match[2].matchAll(/id: "([^"]+)"/g)].map(region => region[1])]));
const report = [];
for (const mode of ['muscles', 'regions']) {
  const bytes = readFileSync(new URL(`mannequin-${mode}.glb`, folder));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const areas = new Set();
  const surfaces = new Map();
  let meshes = 0, triangles = 0;
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const positions = object.geometry.attributes.position;
    assert.ok(positions.count > 0, `${object.name} is empty`);
    assert.ok(Array.from(positions.array).every(Number.isFinite), `${object.name} has invalid vertices`);
    assert.ok(object.geometry.attributes.normal, `${object.name} lacks normals`);
    triangles += (object.geometry.index?.count ?? positions.count) / 3;
    assert.ok(['body', 'surface', 'outline'].includes(object.userData.kind), `${object.name} has no interaction metadata`);
    if (object.userData.kind === 'surface') {
      areas.add(object.userData.area);
      surfaces.set(object.userData.area, object);
      const uv = object.geometry.attributes.uv;
      assert.ok(uv && uv.count === positions.count, `${object.name} lacks muscle fiber UVs`);
      assert.ok(Array.from(uv.array).every(Number.isFinite), `${object.name} has invalid UVs`);
    }
  });
  const expected = mode === 'muscles' ? muscles : muscles.flatMap(muscle => regions.has(muscle) ? regions.get(muscle).map(region => `${muscle}:${region}`) : [muscle]);
  assert.deepEqual([...areas].sort(), expected.sort(), `${mode} area coverage`);
  if (mode === 'muscles') {
    gltf.scene.updateMatrixWorld(true);
    const traps = surfaces.get('traps');
    const bounds = new Box3().setFromObject(traps);
    assert.ok(bounds.max.y > 1.63, 'Upper traps must reach the skull base');
    assert.ok(bounds.max.x > .22 && bounds.min.x < -.22, 'Traps must extend to both shoulders');
    const solids = [];
    gltf.scene.traverse(object => {
      if (object.isMesh && object.userData.kind !== 'outline') solids.push(object);
    });
    for (const height of [1.25,1.35,1.45,1.55,1.62]) {
      const ray = new Raycaster(new Vector3(0,height,-1),new Vector3(0,0,1));
      const hit = ray.intersectObjects(solids,false)[0];
      assert.equal(hit?.object.userData.muscle,'traps', `Exposed centerline at height ${height}`);
    }
  }
  if (mode === 'regions') {
    for (const [a,b] of [['lats:lower','lats:upper'], ['traps:lower','traps:middle'], ['traps:middle','traps:upper']]) {
      const first = surfaces.get(a), second = surfaces.get(b);
      assert.equal(first.userData.continuous, true);
      const positions = first.geometry.attributes.position, normals = first.geometry.attributes.normal;
      const key = (p,i) => [p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
      const edge = new Map();
      for(let i=0;i<positions.count;i++) edge.set(key(positions,i), [normals.getX(i),normals.getY(i),normals.getZ(i)]);
      const other = second.geometry.attributes.position, otherNormals = second.geometry.attributes.normal;
      let shared = 0;
      for(let i=0;i<other.count;i++) {
        const normal = edge.get(key(other,i));
        if (!normal) continue;
        shared++;
        const dot = normal[0]*otherNormals.getX(i)+normal[1]*otherNormals.getY(i)+normal[2]*otherNormals.getZ(i);
        assert.ok(dot > .999, `${a}/${b}: shading discontinuity at shared seam`);
      }
      assert.ok(shared > 10, `${a}/${b}: missing shared seam (gap between heads)`);
    }
  }
  const bounds = new Box3().setFromObject(gltf.scene);
  const height = bounds.max.y - bounds.min.y;
  assert.ok(height > 1.7 && height < 1.9, 'Export must be meters and Y-up');
  assert.ok(triangles < 400_000, 'Web mesh exceeds triangle budget');
  report.push({ mode, meshes, triangles, areas: areas.size, megabytes: Number((bytes.length / 1048576).toFixed(2)), height: Number(height.toFixed(3)) });
}
writeFileSync(fileURLToPath(new URL('validation.json', folder)), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: Blender GLBs load in Three.js; all muscle and region IDs, valid geometry, normals, coordinate scale, and triangle budgets.');
console.log(JSON.stringify(report, null, 2));
