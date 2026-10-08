import { shiftCalendarDate } from "./dates";
import type { TargetDay } from "./types";

export const nutritionMetrics = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbohydrates", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "saturated_fat", label: "Saturated fat", unit: "g" },
  { key: "sugars", label: "Sugars", unit: "g" },
  { key: "added_sugars", label: "Added sugars", unit: "g" },
] as const;

export type NutritionMetric = (typeof nutritionMetrics)[number]["key"];
export type NutritionDay = {
  date: string;
  status: "logged" | "missing" | "future";
  entries: number;
  nutrients: Record<NutritionMetric, number> | null;
};

export function nutritionWeekStart(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftCalendarDate(date, -((day + 6) % 7));
}

export function buildNutritionWeek(history: TargetDay[], start: string, today: string): NutritionDay[] {
  const byDate = new Map(history.map(day => [day.date, day]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = shiftCalendarDate(start, i);
    const record = byDate.get(date);
    const status = date > today ? "future" : record && record.entries > 0 ? "logged" : "missing";
    return {
      date,
      status,
      entries: status === "logged" ? record!.entries : 0,
      nutrients: status === "logged"
        ? Object.fromEntries(nutritionMetrics.map(({ key }) => [key, record!.nutrients[key] ?? 0])) as Record<NutritionMetric, number>
        : null,
    };
  });
}

export function nutritionAverage(days: NutritionDay[], key: NutritionMetric): number | null {
  const logged = days.filter(day => day.nutrients !== null);
  return logged.length ? logged.reduce((sum, day) => sum + day.nutrients![key], 0) / logged.length : null;
}

export function nutritionNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function nutritionDate(date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
}
