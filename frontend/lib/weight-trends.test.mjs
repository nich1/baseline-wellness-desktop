import assert from "node:assert/strict";
import test from "node:test";
import { calculateWeightTrend } from "./weight-trends.ts";

function series(start, offsets, initial, dailyRate) {
  return offsets.map((offset) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return { logged_on: date.toISOString().slice(0, 10), weight: initial + offset * dailyRate };
  });
}

const fullWindow = Array.from({ length: 14 }, (_, index) => index);

test("recognizes a recent decline after an earlier rise without anchoring to the latest low", () => {
  // Synthetic measurements with a gap and a late change in direction.
  const recent = series("2026-09-05", [0, 1, 2, 3, 4, 9, 10, 11, 13], 220, -0.2);
  recent.at(-1).weight -= 2;
  const records = [...series("2026-08-30", [0, 1, 2, 3, 4, 5], 200, 2), ...recent];
  const trend = calculateWeightTrend(records, 210, "2026-09-18");
  assert.equal(trend.status, "toward-goal");
  assert.ok(trend.weeklyRate < -1.4);
  assert.ok(trend.trendWeight > recent.at(-1).weight);
  assert.ok(trend.projectedDate > new Date("2026-09-18T12:00:00"));
  assert.deepEqual(trend, calculateWeightTrend(recent, 210, "2026-09-18"));
});

test("uses actual calendar days across missing logs and ignores old and future entries", () => {
  const recent = series("2026-09-05", [0, 2, 4, 6, 8, 10, 13], 220, -0.2);
  const input = [...recent, { logged_on: "2026-09-04", weight: 500 }, { logged_on: "2026-09-19", weight: 500 }].reverse();
  const snapshot = structuredClone(input);
  const trend = calculateWeightTrend(input, 210, "2026-09-18");
  assert.ok(Math.abs(trend.weeklyRate + 1.4) < 1e-10);
  assert.ok(Math.abs(trend.trendWeight - 217.4) < 1e-10);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(trend, calculateWeightTrend(recent, 210, "2026-09-18"));
});

test("requires seven recent weigh-ins spanning ten calendar days", () => {
  for (const offsets of [[0, 2, 4, 6, 8, 13], [7, 8, 9, 10, 11, 12, 13]]) {
    const trend = calculateWeightTrend(series("2026-09-05", offsets, 220, -0.2), 210, "2026-09-18");
    assert.equal(trend.status, "insufficient-data");
    assert.equal(trend.projectedDate, null);
    assert.equal(trend.weeklyRate, null);
  }
  const enough = calculateWeightTrend(series("2026-09-05", [4, 5, 6, 7, 8, 9, 13], 220, -0.2), 210, "2026-09-18");
  assert.equal(enough.status, "toward-goal");
  const stale = calculateWeightTrend(series("2026-08-01", fullWindow, 220, -0.2), 210, "2026-09-18");
  assert.equal(stale.status, "insufficient-data");
  assert.ok(stale.latestAverage !== null);
  assert.equal(calculateWeightTrend([], 210, "2026-09-18").status, "insufficient-data");
});

test("distinguishes flat, away, at-goal, and no-goal states", () => {
  const flat = series("2026-09-05", fullWindow, 220, 0);
  assert.equal(calculateWeightTrend(flat, 210, "2026-09-18").status, "steady");
  assert.equal(calculateWeightTrend(flat, 220, "2026-09-18").status, "at-goal");
  const increasing = series("2026-09-05", fullWindow, 220, 0.25);
  const away = calculateWeightTrend(increasing, 210, "2026-09-18");
  assert.equal(away.status, "away-from-goal");
  assert.equal(away.projectedDate, null);
  const noGoal = calculateWeightTrend(increasing, null, "2026-09-18");
  assert.equal(noGoal.status, "no-goal");
  assert.equal(noGoal.weeklyRate, 1.75);
  assert.equal(noGoal.projectedDate, null);
});

test("supports gaining toward a goal and projects from the latest fitted weight", () => {
  const trend = calculateWeightTrend(series("2026-09-05", fullWindow, 200, 0.25), 210, "2026-09-18");
  assert.equal(trend.status, "toward-goal");
  assert.equal(trend.trendWeight, 203.25);
  assert.equal(trend.projectedDate.getFullYear(), 2026);
  assert.equal(trend.projectedDate.getMonth(), 9);
  assert.equal(trend.projectedDate.getDate(), 15);
});

test("keeps direction separate from dates beyond the projection horizon", () => {
  const trend = calculateWeightTrend(series("2026-09-05", fullWindow, 220, -0.01), 100, "2026-09-18");
  assert.equal(trend.status, "toward-goal");
  assert.equal(trend.projectedDate, null);
});

test("treats dates across daylight saving as whole calendar days", () => {
  const trend = calculateWeightTrend(series("2026-03-01", fullWindow, 220, -0.25), 210, "2026-03-14");
  assert.equal(trend.weeklyRate, -1.75);
});
