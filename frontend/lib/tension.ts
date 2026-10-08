import type { ExerciseTension, LiftSet } from "./types";

export const muscles = [
  ["chest", "Chest", "#fbbf24"],
  ["lats", "Lats", "#60a5fa"],
  ["upper_back", "Upper back", "#818cf8"],
  ["lower_back", "Lower back", "#a78bfa"],
  ["traps", "Traps", "#c084fc"],
  ["front_delts", "Front delts", "#fb923c"],
  ["side_delts", "Side delts", "#f97316"],
  ["rear_delts", "Rear delts", "#fdba74"],
  ["biceps", "Biceps", "#2dd4bf"],
  ["brachialis", "Brachialis", "#5eead4"],
  ["triceps", "Triceps", "#34d399"],
  ["forearms", "Forearms", "#a3e635"],
  ["abs", "Abs", "#f472b6"],
  ["obliques", "Obliques", "#e879f9"],
  ["glutes", "Glutes", "#38bdf8"],
  ["quads", "Quads", "#22d3ee"],
  ["hamstrings", "Hamstrings", "#a5b4fc"],
  ["adductors", "Adductors", "#fda4af"],
  ["abductors", "Abductors", "#f9a8d4"],
  ["calves", "Calves", "#bef264"],
];

export const muscleRegions: Record<string, { id: string; label: string }[]> = {
  chest: [
    { id: "clavicular", label: "Upper chest · Clavicular" },
    { id: "middle", label: "Middle chest" },
    { id: "lower", label: "Lower chest" },
  ],
  triceps: [
    { id: "long", label: "Long head" },
    { id: "lateral", label: "Lateral head" },
    { id: "medial", label: "Medial head" },
  ],
  lats: [
    { id: "upper", label: "Upper lats" },
    { id: "lower", label: "Lower lats" },
  ],
  upper_back: [
    { id: "rhomboids", label: "Rhomboids" },
    { id: "teres_major", label: "Teres major" },
    { id: "infraspinatus", label: "Infraspinatus" },
    { id: "teres_minor", label: "Teres minor" },
  ],
  lower_back: [
    { id: "erector_spinae", label: "Spinal erectors" },
    { id: "multifidus", label: "Multifidus" },
    { id: "quadratus_lumborum", label: "Quadratus lumborum" },
  ],
  traps: [
    { id: "upper", label: "Upper traps" },
    { id: "middle", label: "Middle traps" },
    { id: "lower", label: "Lower traps" },
  ],
  biceps: [
    { id: "long", label: "Long head" },
    { id: "short", label: "Short head" },
  ],
  forearms: [
    { id: "flexors", label: "Wrist & finger flexors" },
    { id: "extensors", label: "Wrist & finger extensors" },
    { id: "brachioradialis", label: "Brachioradialis" },
    { id: "pronators", label: "Pronators" },
    { id: "supinator", label: "Supinator" },
  ],
  abs: [
    { id: "upper", label: "Upper abs" },
    { id: "lower", label: "Lower abs" },
    { id: "transverse", label: "Transverse abdominis" },
  ],
  obliques: [
    { id: "external", label: "External obliques" },
    { id: "internal", label: "Internal obliques" },
  ],
  glutes: [
    { id: "maximus", label: "Gluteus maximus" },
    { id: "medius", label: "Gluteus medius" },
    { id: "minimus", label: "Gluteus minimus" },
  ],
  quads: [
    { id: "rectus_femoris", label: "Rectus femoris" },
    { id: "vastus_lateralis", label: "Vastus lateralis" },
    { id: "vastus_medialis", label: "Vastus medialis" },
    { id: "vastus_intermedius", label: "Vastus intermedius" },
  ],
  hamstrings: [
    { id: "biceps_femoris_long", label: "Biceps femoris · Long head" },
    { id: "biceps_femoris_short", label: "Biceps femoris · Short head" },
    { id: "semitendinosus", label: "Semitendinosus" },
    { id: "semimembranosus", label: "Semimembranosus" },
  ],
  adductors: [
    { id: "magnus", label: "Adductor magnus" },
    { id: "longus", label: "Adductor longus" },
    { id: "brevis", label: "Adductor brevis" },
    { id: "gracilis", label: "Gracilis" },
    { id: "pectineus", label: "Pectineus" },
  ],
  abductors: [
    { id: "medius", label: "Gluteus medius" },
    { id: "minimus", label: "Gluteus minimus" },
    { id: "tfl", label: "Tensor fasciae latae" },
  ],
  calves: [
    { id: "gastrocnemius_medial", label: "Gastrocnemius · Medial head" },
    { id: "gastrocnemius_lateral", label: "Gastrocnemius · Lateral head" },
    { id: "soleus", label: "Soleus" },
  ],
};

// Store only explicit choices; unspecified regions share the remainder.
export function resolveRegions(muscle: string, overrides: Record<string, number> = {}) {
  const regions = muscleRegions[muscle] ?? [];
  const automatic = regions.filter(({ id }) => overrides[id] === undefined);
  const remaining = 100 - Object.values(overrides).reduce((sum, value) => sum + value, 0);
  const share = automatic.length ? Math.floor(remaining / automatic.length) : 0;
  let extra = automatic.length ? remaining % automatic.length : 0;
  return regions.map((region) => ({
    ...region,
    automatic: overrides[region.id] === undefined,
    percent: overrides[region.id] ?? (share + (extra-- > 0 ? 1 : 0)),
  }));
}

export function regionsComplete(muscle: string, overrides?: Record<string, number>) {
  const regions = resolveRegions(muscle, overrides);
  return !regions.length || regions.reduce((sum, region) => sum + region.percent, 0) === 100;
}

export type MuscleVolume = {
  muscle: string;
  volume: number;
  regions: { id: string; label: string; volume: number }[];
  exercises: { exercise: string; volume: number }[];
};

export function distributeVolume(lifts: LiftSet[], profiles: ExerciseTension[]) {
  const settings = new Map(profiles.map((profile) => [profile.exercise, profile.allocations]));
  const groups = new Map<string, MuscleVolume>();
  const missing = new Map<string, number>();
  let total = 0;
  let unassigned = 0;
  for (const lift of lifts) {
    const volume = lift.weight * lift.reps;
    total += volume;
    let assigned = 0;
    for (const allocation of settings.get(lift.exercise) ?? []) {
      const share = volume * allocation.percent / 100;
      assigned += share;
      if (share <= 0) continue;
      let group = groups.get(allocation.muscle);
      if (!group) {
        group = { muscle: allocation.muscle, volume: 0, regions: [], exercises: [] };
        groups.set(allocation.muscle, group);
      }
      group.volume += share;
      const contribution = group.exercises.find((item) => item.exercise === lift.exercise);
      if (contribution) contribution.volume += share;
      else group.exercises.push({ exercise: lift.exercise, volume: share });
      for (const region of resolveRegions(allocation.muscle, allocation.heads)) {
        const regionVolume = share * region.percent / 100;
        const existing = group.regions.find((item) => item.id === region.id);
        if (existing) existing.volume += regionVolume;
        else group.regions.push({ id: region.id, label: region.label, volume: regionVolume });
      }
    }
    const remainder = Math.max(0, volume - assigned);
    if (remainder > 0.000001) {
      unassigned += remainder;
      missing.set(lift.exercise, (missing.get(lift.exercise) ?? 0) + remainder);
    }
  }
  return {
    total,
    unassigned,
    missing: Array.from(missing, ([exercise, volume]) => ({ exercise, volume })),
    groups: [...groups.values()].sort((a, b) => b.volume - a.volume || a.muscle.localeCompare(b.muscle)),
  };
}

// Keep each parent’s regions adjacent, in their configured anatomical order.
export function flattenMuscleVolumes(groups: MuscleVolume[]) {
  return groups.flatMap((group) => {
    const [, label, baseColor] = muscles.find(([id]) => id === group.muscle) ?? [group.muscle, group.muscle, "#a1a1aa"];
    const color = `var(--muscle-${group.muscle}, ${baseColor})`;
    return group.regions.length ? group.regions.map((region, index) => ({
      id: `${group.muscle}:${region.id}`,
      muscle: group.muscle,
      label: region.label,
      parent: label,
      parentPercent: group.volume ? region.volume / group.volume * 100 : 0,
      volume: region.volume,
      color: `color-mix(in srgb, ${color} ${100 - index * 10}%, white)`,
    })) : [{
      id: group.muscle, muscle: group.muscle, label, parent: "", parentPercent: 100, volume: group.volume, color,
    }];
  });
}
