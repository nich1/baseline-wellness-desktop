import assert from "node:assert/strict";
import test from "node:test";
import { aggregateExerciseDays } from "./lift-trends.ts";

function lift(id, date, weight, reps, exercise = "Squat") {
  return { id, logged_on: date, weight, reps, exercise, created_at: `${date}T12:00:00` };
}

test("tooltip details match the best estimated set and daily volume for the selected exercise", () => {
  const bestSet = lift(2, "2026-09-25", 100, 12);
  const lifts = [
    lift(1, "2026-09-25", 120, 1),
    bestSet,
    lift(3, "2026-09-25", 90, 8),
    lift(4, "2026-09-24", 80, 5),
    lift(5, "2026-09-25", 300, 10, "Deadlift"),
  ];
  const snapshot = structuredClone(lifts);
  const days = aggregateExerciseDays(lifts, "Squat");
  assert.deepEqual(days.map((day) => day.date), ["2026-09-24", "2026-09-25"]);
  assert.deepEqual(days[1], {
    date: "2026-09-25", strength: 140, volume: 2040, sets: 3,
    reps: 21, minWeight: 90, maxWeight: 120, bestSet,
  });
  assert.equal(days[0].minWeight, days[0].maxWeight);
  assert.equal(days[0].bestSet.reps, 5);
  assert.deepEqual(lifts, snapshot);
});

test("handles empty exercise history and sets with zero external weight", () => {
  assert.deepEqual(aggregateExerciseDays([], "Squat"), []);
  const bodyweight = lift(1, "2026-09-25", 0, 10, "Pull-up");
  const [day] = aggregateExerciseDays([bodyweight], "Pull-up");
  assert.equal(day.bestSet, bodyweight);
  assert.equal(day.strength, 0);
  assert.equal(day.volume, 0);
  assert.equal(day.reps, 10);
  assert.equal(day.sets, 1);
});
