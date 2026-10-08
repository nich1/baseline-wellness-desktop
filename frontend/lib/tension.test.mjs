import assert from 'node:assert/strict';
import test from 'node:test';
import { muscleRegions, resolveRegions, regionsComplete } from './tension.ts';

test('chest and triceps distribute only the remaining share to automatic regions', () => {
  assert.deepEqual(resolveRegions('chest', { clavicular: 70 }).map(r => r.percent), [70, 15, 15]);
  assert.deepEqual(resolveRegions('triceps', { long: 30, lateral: 30 }).map(r => r.percent), [30, 30, 40]);
  assert.deepEqual(resolveRegions('chest', { clavicular: 100 }).map(r => r.percent), [100, 0, 0]);
  assert.deepEqual(resolveRegions('chest', { clavicular: 0 }).map(r => r.percent), [0, 50, 50]);
});
test('rounding preserves 100 and explicit values stay fixed', () => {
  assert.deepEqual(resolveRegions('chest').map(r => r.percent), [34, 33, 33]);
  assert.deepEqual(resolveRegions('chest', { clavicular: 71 }).map(r => r.percent), [71, 15, 14]);
  assert.equal(regionsComplete('triceps', { long: 30, lateral: 30, medial: 30 }), false);
  assert.equal(regionsComplete('triceps', { long: 30, lateral: 30, medial: 40 }), true);
  assert.deepEqual(resolveRegions('rear_delts'), []);
});


test('all non-deltoid groups offer regions that preserve the total', () => {
  assert.equal(Object.keys(muscleRegions).length, 16);
  for (const [muscle, regions] of Object.entries(muscleRegions)) {
    const first = regions[0].id;
    const resolved = resolveRegions(muscle, { [first]: 70 });
    assert.equal(resolved[0].percent, 70);
    assert.equal(resolved.reduce((sum, region) => sum + region.percent, 0), 100);
    assert.equal(resolved.filter(region => region.automatic).length, regions.length - 1);
  }
  assert.deepEqual(resolveRegions('lats', { upper: 70 }).map(r => r.percent), [70, 30]);
  assert.deepEqual(resolveRegions('traps', { upper: 70 }).map(r => r.percent), [70, 15, 15]);
  for (const muscle of ['front_delts', 'side_delts', 'rear_delts']) {
    assert.deepEqual(resolveRegions(muscle), []);
  }
});
