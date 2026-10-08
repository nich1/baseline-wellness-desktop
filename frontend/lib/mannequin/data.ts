import { muscleRegions, muscles, resolveRegions, type MuscleVolume } from "../tension";
import type { ExerciseTension, LiftSet } from "../types";

export type MuscleArea = {
  id: string;
  muscle: string;
  region?: string;
  label: string;
  parent: string;
  color: string;
  volume: number;
  intensity: number;
  parentVolume: number;
  exercises: { exercise: string; volume: number }[];
};

// Region contributions must be calculated per exercise: multiplying the day's
// muscle total by one exercise's head percentages gives misleading attribution.
export function mannequinAreas(groups: MuscleVolume[], lifts: LiftSet[], profiles: ExerciseTension[], regions: boolean, palette: Record<string, string> = {}): MuscleArea[] {
  const settings = new Map(profiles.map(profile => [profile.exercise, profile.allocations]));
  const areas: MuscleArea[] = muscles.flatMap(([muscle, label, fallback]) => {
    const color = palette[`muscle-${muscle}`] ?? fallback;
    const group = groups.find(item => item.muscle === muscle);
    const definitions = regions ? muscleRegions[muscle] : undefined;
    if (!definitions?.length) return [{ id: muscle, muscle, label, parent: label, color, volume: group?.volume ?? 0, parentVolume: group?.volume ?? 0, intensity: 0, exercises: group?.exercises ?? [] }];
    return definitions.map((region, index) => {
      const contributions = new Map<string, number>();
      for (const lift of lifts) {
        const allocation = settings.get(lift.exercise)?.find(item => item.muscle === muscle);
        if (!allocation) continue;
        const share = resolveRegions(muscle, allocation.heads).find(item => item.id === region.id)?.percent ?? 0;
        const volume = lift.weight * lift.reps * allocation.percent / 100 * share / 100;
        if (volume > 0) contributions.set(lift.exercise, (contributions.get(lift.exercise) ?? 0) + volume);
      }
      // Match the bar chart's progressive white tint without CSS color-mix,
      // which isn't a supported color input in the 3D renderer.
      const tint = Math.min(index * .1, .7);
      const rgb = [1, 3, 5].map(start => Math.round(parseInt(color.slice(start, start + 2), 16) * (1 - tint) + 255 * tint));
      return { id: `${muscle}:${region.id}`, muscle, region: region.id, label: region.label, parent: label,
        color: `#${rgb.map(value => value.toString(16).padStart(2, "0")).join("")}`,
        volume: group?.regions.find(item => item.id === region.id)?.volume ?? 0,
        parentVolume: group?.volume ?? 0, intensity: 0,
        exercises: Array.from(contributions, ([exercise, volume]) => ({ exercise, volume })).sort((a, b) => b.volume - a.volume),
      };
    });
  });
  const maximum = Math.max(0, ...areas.map(area => area.volume));
  return areas.map(area => ({ ...area, intensity: maximum > 0 ? area.volume / maximum : 0 }));
}
