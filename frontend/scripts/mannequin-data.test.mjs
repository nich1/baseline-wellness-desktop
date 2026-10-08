// Run: node scripts/mannequin-data.test.mjs
// Load these pure TypeScript modules without adding a test runner dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();
function load(filename) {
  const absolute = path.resolve(scriptDirectory, '..', filename);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const loaded = {exports:{}}; cache.set(absolute, loaded);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const localRequire = name => {
    if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute), name+'.ts'));
    if (name === 'three') return THREE;
    if (name === 'three/addons/loaders/GLTFLoader.js') return {GLTFLoader: class extends GLTFLoader {
      async loadAsync(url) {
        const bytes = fs.readFileSync(path.resolve(scriptDirectory, '../public' + url));
        return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      }
    }};
    throw new Error('Unexpected test import: '+name);
  };
  new Function('require','module','exports',code)(localRequire,loaded,loaded.exports);
  return loaded.exports;
}
const {mannequinAreas} = load('lib/mannequin/data.ts');
const {distributeVolume, muscles, muscleRegions} = load('lib/tension.ts');
const {createMannequin} = load('lib/mannequin/model.ts');
const lifts = [{exercise:'Bench',weight:100,reps:10},{exercise:'Incline',weight:50,reps:10},{exercise:'Unassigned',weight:50,reps:10}];
const profiles = [
  {exercise:'Bench',allocations:[{muscle:'chest',percent:60,heads:{clavicular:70}},{muscle:'triceps',percent:40}]},
  {exercise:'Incline',allocations:[{muscle:'chest',percent:80,heads:{clavicular:10}},{muscle:'front_delts',percent:20}]},
];
const {groups,total,unassigned} = distributeVolume(lifts,profiles);
assert.equal(total,2000); assert.equal(unassigned,500);
const whole = mannequinAreas(groups,lifts,profiles,false);
assert.equal(whole.length,muscles.length);
assert.equal(whole.find(x=>x.id==='chest').volume,1000);
assert.equal(whole.find(x=>x.id==='chest').intensity,1);
assert.equal(whole.find(x=>x.id==='triceps').intensity,.4);
assert.equal(whole.find(x=>x.id==='quads').intensity,0);
const regions = mannequinAreas(groups,lifts,profiles,true);
const upper = regions.find(x=>x.id==='chest:clavicular');
assert.equal(upper.volume,460);
assert.deepEqual(upper.exercises,[{exercise:'Bench',volume:420},{exercise:'Incline',volume:40}]);
assert.equal(upper.parentVolume,1000);
assert.equal(regions.find(x=>x.id==='chest:middle').volume,270);
assert.equal(regions.find(x=>x.id==='chest:lower').volume,270);
assert.equal(upper.intensity,1);
assert.equal(upper.volume/total*100,23);
assert.equal(regions.reduce((sum,x)=>sum+x.volume,0),1500);
for (const group of groups) assert.equal(regions.filter(x=>x.muscle===group.muscle).reduce((sum,x)=>sum+x.volume,0),group.volume);
for (const area of mannequinAreas([],[],[],true)) { assert.equal(area.intensity,0); assert.equal(area.volume,0); }
assert.ok(!regions.some(area=>area.muscle.endsWith('delts') && area.region));

const model=await createMannequin();
model.setMode(true);
for (const [muscle] of muscles) {
  assert.ok(model.patches.some(p=>p.muscle===muscle),muscle+' whole area missing');
  for (const region of muscleRegions[muscle]??[]) assert.ok(model.patches.some(p=>p.muscle===muscle&&p.region===region.id),muscle+':'+region.id+' missing');
}
model.setMode(false);
assert.equal(new Set(model.patches.filter(p=>p.mesh.visible).map(p=>p.muscle)).size, muscles.length);
assert.ok(model.patches.every(p=>!p.region), 'Whole mode must use group volume');
model.setMode(true);
assert.equal(model.patches.filter(p=>p.mesh.visible).length, regions.length);
assert.equal(new Set(model.patches.map(p=>p.mesh.material)).size, model.patches.length);
for (const patch of model.patches) {
  const positions=patch.mesh.geometry.getAttribute('position').array;
  assert.ok(positions.length>0);
  assert.ok(Array.from(positions).every(Number.isFinite),patch.muscle+' invalid geometry');
}
console.log(`PASS: whole/region totals, per-exercise head attribution, relative intensity, zero and unassigned volume; all ${muscles.length} muscles and ${Object.values(muscleRegions).flat().length} regions mapped (${model.patches.length} surface patches).`);

