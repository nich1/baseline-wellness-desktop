import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyWeightHistory } from "./weekly-weight-history.ts";

test("shows partial weeks on their latest weigh-ins across a travel gap", () => {
  const records = [
    { logged_on: "2026-09-15", weight: 202 },
    { logged_on: "2026-09-07", weight: 198 },
    { logged_on: "2026-09-14", weight: 200 },
    { logged_on: "2026-09-09", weight: 202 },
    { logged_on: "2026-09-08", weight: 200 },
  ];
  const rows = buildWeeklyWeightHistory(records, "2026-09-15");
  assert.deepEqual(rows.map((row) => row.logged_on), [
    "2026-09-15", "2026-09-14", "2026-09-09", "2026-09-08", "2026-09-07",
  ]);
  assert.equal(rows[0].weeklyAverage, 201);
  assert.equal(rows[0].weeklyChangePercent, 0.5);
  assert.equal(rows[2].weeklyAverage, 200);
  assert.equal(rows.filter((row) => row.weeklyAverage !== undefined).length, 2);
  assert.deepEqual(buildWeeklyWeightHistory(records, "2026-09-16"), rows);
});

test("keeps completed-week averages on Sunday when Sunday was logged", () => {
  const rows = buildWeeklyWeightHistory([
    { logged_on: "2026-09-06", weight: 202 },
    { logged_on: "2026-08-31", weight: 200 },
  ], "2026-09-15");
  assert.equal(rows[0].weeklyAverage, 201);
  assert.equal(rows[1].weeklyAverage, undefined);
});

test("shows a single Monday weigh-in and excludes future records", () => {
  const rows = buildWeeklyWeightHistory([
    { logged_on: "2026-09-14", weight: 200 },
    { logged_on: "2026-09-15", weight: 210 },
    { logged_on: "2026-09-21", weight: 220 },
  ], "2026-09-14");
  assert.equal(rows[0].weeklyAverage, undefined);
  assert.equal(rows[1].weeklyAverage, undefined);
  assert.equal(rows[2].weeklyAverage, 200);
  assert.equal(rows[2].weeklyChangePercent, undefined);
});

test("does not compare against an older week when the previous week is empty", () => {
  const rows = buildWeeklyWeightHistory([
    { logged_on: "2026-09-06", weight: 200 },
    { logged_on: "2026-09-15", weight: 202 },
  ], "2026-09-15");
  assert.equal(rows[0].weeklyAverage, 202);
  assert.equal(rows[0].weeklyChangePercent, undefined);
  assert.deepEqual(buildWeeklyWeightHistory([], "2026-09-15"), []);
});
