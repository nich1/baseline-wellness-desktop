// Run: node scripts/nutrition-trends.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function load(filename) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports,
    name => load(path.resolve(path.dirname(filename), name + '.ts')));
  return module.exports;
}
const { nutritionWeekStart, buildNutritionWeek, nutritionAverage } = load(path.join(root, 'lib/nutrition-trends.ts'));
assert.equal(nutritionWeekStart('2026-10-08'), '2026-10-05');
assert.equal(nutritionWeekStart('2026-10-11'), '2026-10-05');
assert.equal(nutritionWeekStart('2026-10-12'), '2026-10-12');
assert.equal(nutritionWeekStart('2027-01-01'), '2026-12-28');
assert.equal(nutritionWeekStart('2026-11-01'), '2026-10-26');
const row = (date, entries, calories, protein = 0) => ({ date, entries, nutrients: { calories, protein } });
const week = buildNutritionWeek([
  row('2026-10-05', 2, 2000, 150),
  row('2026-10-06', 0, 0),
  row('2026-10-07', 3, 2200, 180),
  row('2026-10-08', 1, 0),
  row('2026-10-09', 1, 9999),
  row('2026-10-04', 1, 9999),
], '2026-10-05', '2026-10-08');
assert.equal(week.length, 7);
assert.deepEqual(week.map(d => d.status), ['logged', 'missing', 'logged', 'logged', 'future', 'future', 'future']);
assert.equal(nutritionAverage(week, 'calories'), 1400);
assert.equal(nutritionAverage(week, 'protein'), 110);
assert.equal(nutritionAverage(week, 'fiber'), 0);
assert.equal(week[1].nutrients, null);
assert.equal(week[3].nutrients.calories, 0);
assert.equal(week[4].nutrients, null);
assert.equal(nutritionAverage(buildNutritionWeek([], '2026-09-28', '2026-10-08'), 'calories'), null);
assert.deepEqual(buildNutritionWeek([], '2026-10-26', '2026-11-05').map(d => d.date),
  ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
console.log('PASS: Monday–Sunday weeks, year/DST boundaries, logged-only averages, zero intake, missing/future days, empty weeks');
