import {
  ExerciseTension,
  BodyWeightRecord,
  CardioSession,
  CardioSessionPayload,
  DailyLog,
  EntryPayload,
  FoodEntry,
  LiftSet,
  LiftSetPayload,
  Meal,
  MealPayload,
  NutritionTargets,
  TargetDay,
  SavedFood,
  SavedFoodPayload,
  HistoryExport,
  LogCategory,
  CopyToTodayResult,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Something went wrong");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  getExerciseTensions: () => request<ExerciseTension[]>("/exercise-tensions"),
  saveExerciseTension: (profile: ExerciseTension) =>
    request<ExerciseTension>("/exercise-tensions", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),
  copyToToday: (sourceDate: string, category: LogCategory) =>
    request<CopyToTodayResult>("/copy-to-today", {
      method: "POST",
      body: JSON.stringify({ source_date: sourceDate, category }),
    }),
  exportHistory: (startDate: string, endDate: string) =>
    request<HistoryExport>(`/export?${new URLSearchParams({ start_date: startDate, end_date: endDate })}`),
  getTargetHistory: (start: string, end: string) => request<TargetDay[]>(`/target-history?start_date=${start}&end_date=${end}`),
  getTargets: () => request<NutritionTargets & { id: number }>("/targets"),
  updateTargets: (targets: NutritionTargets) =>
    request<NutritionTargets & { id: number }>("/targets", {
      method: "PUT",
      body: JSON.stringify(targets),
    }),
  updateBodyweight: (date: string, weight: number) =>
    request<{ logged_on: string; weight: number }>(`/bodyweight/${date}`, {
      method: "PUT",
      body: JSON.stringify({ weight }),
    }),
  deleteBodyweight: (date: string) =>
    request<void>(`/bodyweight/${date}`, { method: "DELETE" }),
  getBodyweights: (startDate?: string) =>
    request<BodyWeightRecord[]>(
      `/bodyweight${startDate ? `?start_date=${encodeURIComponent(startDate)}` : ""}`,
    ),
  getBodyweightGoal: () =>
    request<{ id: number; weight: number } | null>("/bodyweight-goal"),
  updateBodyweightGoal: (weight: number) =>
    request<{ id: number; weight: number }>("/bodyweight-goal", {
      method: "PUT",
      body: JSON.stringify({ weight }),
    }),
  getLifts: (params?: { loggedOn?: string; startDate?: string; exercise?: string }) => {
    const query = new URLSearchParams();
    if (params?.loggedOn) query.set("logged_on", params.loggedOn);
    if (params?.startDate) query.set("start_date", params.startDate);
    if (params?.exercise) query.set("exercise", params.exercise);
    return request<LiftSet[]>(`/lifts${query.size ? `?${query}` : ""}`);
  },
  createLift: (lift: LiftSetPayload) =>
    request<LiftSet>("/lifts", {
      method: "POST",
      body: JSON.stringify(lift),
    }),
  updateLift: (id: number, lift: LiftSetPayload) =>
    request<LiftSet>(`/lifts/${id}`, {
      method: "PUT",
      body: JSON.stringify(lift),
    }),
  deleteLift: (id: number) =>
    request<void>(`/lifts/${id}`, { method: "DELETE" }),
  getCardio: (params?: { loggedOn?: string; startDate?: string; activity?: string }) => {
    const query = new URLSearchParams();
    if (params?.loggedOn) query.set("logged_on", params.loggedOn);
    if (params?.startDate) query.set("start_date", params.startDate);
    if (params?.activity) query.set("activity", params.activity);
    return request<CardioSession[]>(`/cardio${query.size ? `?${query}` : ""}`);
  },
  createCardio: (session: CardioSessionPayload) =>
    request<CardioSession>("/cardio", {
      method: "POST",
      body: JSON.stringify(session),
    }),
  updateCardio: (id: number, session: CardioSessionPayload) =>
    request<CardioSession>(`/cardio/${id}`, {
      method: "PUT",
      body: JSON.stringify(session),
    }),
  deleteCardio: (id: number) =>
    request<void>(`/cardio/${id}`, { method: "DELETE" }),
  getDay: (date: string) =>
    request<DailyLog>(`/entries?eaten_on=${encodeURIComponent(date)}`),
  createEntry: (entry: EntryPayload) =>
    request<FoodEntry>("/entries", {
      method: "POST",
      body: JSON.stringify(entry),
    }),
  updateEntry: (id: number, entry: EntryPayload) =>
    request<FoodEntry>(`/entries/${id}`, {
      method: "PUT",
      body: JSON.stringify(entry),
    }),
  deleteEntry: (id: number) =>
    request<void>(`/entries/${id}`, { method: "DELETE" }),

  reorderEntries: (date: string, entryIds: number[]) =>
    request<void>("/entries/order", {
      method: "PUT",
      body: JSON.stringify({ eaten_on: date, entry_ids: entryIds }),
    }),
  getFoods: () => request<SavedFood[]>("/foods"),
  createFood: (food: SavedFoodPayload) =>
    request<SavedFood>("/foods", {
      method: "POST",
      body: JSON.stringify(food),
    }),
  updateFood: (id: number, food: SavedFoodPayload) =>
    request<SavedFood>(`/foods/${id}`, {
      method: "PUT",
      body: JSON.stringify(food),
    }),
  deleteFood: (id: number) =>
    request<void>(`/foods/${id}`, { method: "DELETE" }),
  logFood: (id: number, eatenOn: string, quantity = 1) =>
    request<FoodEntry>(`/foods/${id}/log`, {
      method: "POST",
      body: JSON.stringify({ eaten_on: eatenOn, quantity }),
    }),
  getMeals: () => request<Meal[]>("/meals"),
  createMeal: (meal: MealPayload) =>
    request<Meal>("/meals", {
      method: "POST",
      body: JSON.stringify(meal),
    }),
  updateMeal: (id: number, meal: MealPayload) =>
    request<Meal>(`/meals/${id}`, {
      method: "PUT",
      body: JSON.stringify(meal),
    }),
  deleteMeal: (id: number) =>
    request<void>(`/meals/${id}`, { method: "DELETE" }),
  logMeal: (id: number, eatenOn: string, quantity = 1) =>
    request<FoodEntry[]>(`/meals/${id}/log`, {
      method: "POST",
      body: JSON.stringify({ eaten_on: eatenOn, quantity }),
    }),
};
