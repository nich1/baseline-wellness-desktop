import assert from 'node:assert/strict';
import test from 'node:test';
import { distributeVolume } from './tension.ts';

const lift = (exercise, weight, reps) => ({ exercise, weight, reps });
const profile = (exercise, allocations) => ({ exercise, allocations });

test('weights every set and aggregates region volumes across different exercises', () => {
  const result = distributeVolume([
    lift('Bench',100,10), lift('Bench',100,5), lift('Incline',50,10),
  ], [
    profile('Bench', [{muscle:'chest',percent:60,heads:{clavicular:70}}, {muscle:'triceps',percent:40,heads:{long:30,lateral:30}}]),
    profile('Incline', [{muscle:'chest',percent:80,heads:{clavicular:50}}, {muscle:'front_delts',percent:20}]),
  ]);
  assert.equal(result.total, 2000);
  assert.equal(result.unassigned, 0);
  assert.deepEqual(result.groups.map(g => [g.muscle,g.volume]), [['chest',1300],['triceps',600],['front_delts',100]]);
  assert.deepEqual(result.groups[0].regions.map(r => r.volume), [830,235,235]);
  assert.deepEqual(result.groups[1].regions.map(r => r.volume), [180,180,240]);
  assert.deepEqual(result.groups[0].exercises, [{exercise:'Bench',volume:900},{exercise:'Incline',volume:400}]);
  assert.deepEqual(result.groups[2].regions, []);
});

test('keeps missing and legacy partial allocations visible without renormalizing', () => {
  const result = distributeVolume([lift('Unknown',100,10),lift('Partial',50,10)], [
    profile('Partial', [{muscle:'rear_delts',percent:70}]),
  ]);
  assert.equal(result.total,1500);
  assert.equal(result.groups[0].volume,350);
  assert.equal(result.unassigned,1150);
  assert.deepEqual(result.missing,[{exercise:'Unknown',volume:1000},{exercise:'Partial',volume:150}]);
  assert.equal(result.groups.reduce((sum,g)=>sum+g.volume,0)+result.unassigned,result.total);
});

test('handles empty days, zero shares, fractional loads and repeated sets without mutation', () => {
  assert.deepEqual(distributeVolume([],[]),{total:0,unassigned:0,missing:[],groups:[]});
  const profiles = [profile('Curl',[{muscle:'biceps',percent:65},{muscle:'brachialis',percent:35},{muscle:'forearms',percent:0}])];
  const lifts = [lift('Curl',12.5,9),lift('Curl',12.5,7)];
  const before = structuredClone({profiles,lifts});
  const result = distributeVolume(lifts,profiles);
  assert.equal(result.total,200);
  assert.deepEqual(result.groups.map(g=>g.volume),[130,70]);
  assert.deepEqual(result.groups[0].regions.map(r=>r.volume),[65,65]);
  assert.deepEqual({profiles,lifts},before);
  assert.equal(distributeVolume(lifts.slice(1),profiles).total,87.5);
});

test('region chart replaces parent volumes without double counting and preserves unsplit muscles', async () => {
  const { flattenMuscleVolumes } = await import('./tension.ts');
  const result = distributeVolume([lift('Bench',100,10)], [
    profile('Bench', [{muscle:'chest',percent:60,heads:{clavicular:70}},{muscle:'front_delts',percent:30}]),
  ]);
  const rows = flattenMuscleVolumes(result.groups);
  assert.deepEqual(rows.map(r => [r.id,r.volume]), [['chest:clavicular',420],['chest:middle',90],['chest:lower',90],['front_delts',300]]);
  assert.equal(rows[0].parentPercent,70);
  assert.equal(rows[2].parentPercent,15);
  assert.equal(rows.reduce((sum,r)=>sum+r.volume,0)+result.unassigned,result.total);
  assert.equal(rows[3].parent,'');
  assert.deepEqual(flattenMuscleVolumes([]),[]);
});


test('trap regions stay together even when rear delt volume falls between them', async () => {
  const { flattenMuscleVolumes } = await import('./tension.ts');
  const result = distributeVolume([lift('Row',100,10)], [
    profile('Row', [{muscle:'traps',percent:60,heads:{upper:70,middle:20,lower:10}},{muscle:'rear_delts',percent:40}]),
  ]);
  const rows = flattenMuscleVolumes(result.groups);
  assert.deepEqual(rows.map(r => r.id), ['traps:upper','traps:middle','traps:lower','rear_delts']);
  assert.deepEqual(rows.map(r => r.volume), [420,120,60,400]);
  assert.equal(rows.filter(r => r.muscle === 'traps').reduce((sum,r)=>sum+r.volume,0),600);
});
