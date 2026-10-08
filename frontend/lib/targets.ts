import type { NutritionTargets } from "./types";

export type TargetField = { key: keyof NutritionTargets; label: string; unit: string; kind: "budget" | "minimum" | "limit"; group: "Nutrition" | "Strength" | "Cardio"; required?: boolean; max?: number };
export const targetFields: TargetField[] = [
  { key: "calories", label: "Calories", unit: "kcal", kind: "budget", group: "Nutrition", required: true },
  { key: "protein", label: "Protein", unit: "g", kind: "minimum", group: "Nutrition", required: true },
  { key: "carbohydrates", label: "Carbs", unit: "g", kind: "budget", group: "Nutrition", required: true },
  { key: "fat", label: "Fat", unit: "g", kind: "budget", group: "Nutrition", required: true },
  { key: "fiber", label: "Fiber", unit: "g", kind: "minimum", group: "Nutrition" },
  { key: "potassium", label: "Potassium", unit: "mg", kind: "minimum", group: "Nutrition" },
  { key: "saturated_fat", label: "Saturated fat", unit: "g", kind: "limit", group: "Nutrition" },
  { key: "added_sugars", label: "Added sugar", unit: "g", kind: "limit", group: "Nutrition" },
  { key: "sugars", label: "Total sugar", unit: "g", kind: "limit", group: "Nutrition" },
  { key: "sodium", label: "Sodium", unit: "mg", kind: "limit", group: "Nutrition" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", kind: "limit", group: "Nutrition" },
  { key: "strength_days", label: "Training days", unit: "days", kind: "minimum", group: "Strength", max: 7 },
  { key: "strength_sets", label: "Work sets", unit: "sets", kind: "minimum", group: "Strength" },
  { key: "cardio_days", label: "Active days", unit: "days", kind: "minimum", group: "Cardio", max: 7 },
  { key: "cardio_minutes", label: "Training time", unit: "min", kind: "minimum", group: "Cardio" },
  { key: "cardio_miles", label: "Distance", unit: "mi", kind: "minimum", group: "Cardio" },
];
export function targetStatus(value: number, target: number, kind: TargetField["kind"]) {
  if (kind === "limit") return value <= target ? "Within limit" : "Over limit";
  if (kind === "minimum") return value >= target ? "Met" : "Remaining";
  return value > target ? "Above budget" : value === target ? "At budget" : "Remaining";
}
