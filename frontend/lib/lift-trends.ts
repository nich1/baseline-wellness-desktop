import type { LiftSet } from "./types";

export type ExerciseDay = {
  date: string;
  strength: number;
  volume: number;
  sets: number;
  reps: number;
  minWeight: number;
  maxWeight: number;
  bestSet: LiftSet;
};

export function estimatedOneRepMax(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

export function aggregateExerciseDays(
  lifts: LiftSet[],
  exercise: string,
): ExerciseDay[] {
  const days = new Map<string, ExerciseDay>();
  for (const lift of lifts) {
    if (lift.exercise !== exercise) continue;
    const current = days.get(lift.logged_on) ?? {
      date: lift.logged_on,
      strength: 0,
      volume: 0,
      sets: 0,
      reps: 0,
      minWeight: lift.weight,
      maxWeight: lift.weight,
      bestSet: lift,
    };
    if (estimatedOneRepMax(lift.weight, lift.reps) > current.strength) {
      current.bestSet = lift;
    }
    current.strength = Math.max(
      current.strength,
      estimatedOneRepMax(lift.weight, lift.reps),
    );
    current.volume += lift.weight * lift.reps;
    current.sets += 1;
    current.reps += lift.reps;
    current.minWeight = Math.min(current.minWeight, lift.weight);
    current.maxWeight = Math.max(current.maxWeight, lift.weight);
    days.set(lift.logged_on, current);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
