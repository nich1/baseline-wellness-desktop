export type FoodEntry = {
  id: number;
  name: string;
  serving: string | null;
  quantity: number;
  eaten_on: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fiber: number;
  sugars: number;
  added_sugars: number;
  sugar_alcohols: number;
  fat: number;
  saturated_fat: number;
  trans_fat: number;
  monounsaturated_fat: number;
  polyunsaturated_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  created_at: string;
};

export type EntryPayload = Omit<FoodEntry, "id" | "created_at">;

export type LogCategory = "food" | "lifts" | "cardio";
export type CopyToTodayResult = {
  source_date: string;
  target_date: string;
  category: LogCategory;
  copied_count: number;
};

export type DailyLog = {
  date: string;
  entries: FoodEntry[];
  bodyweight: number | null;
  totals: Pick<
    FoodEntry,
    | "calories"
    | "protein"
    | "carbohydrates"
    | "fiber"
    | "sugars"
    | "fat"
    | "saturated_fat"
    | "sodium"
  >;
};

export type SavedFood = Omit<FoodEntry, "eaten_on" | "quantity">;
export type SavedFoodPayload = Omit<SavedFood, "id" | "created_at">;

export type MealItem = {
  id: number;
  quantity: number;
  food: SavedFood;
};

export type Meal = {
  id: number;
  name: string;
  created_at: string;
  items: MealItem[];
  calories: number;
  protein: number;
};

export type MealPayload = {
  name: string;
  items: Array<{ food_id: number; quantity: number }>;
};

export type NutritionTargets = {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number | null;
  potassium?: number | null;
  saturated_fat?: number | null;
  added_sugars?: number | null;
  sugars?: number | null;
  sodium?: number | null;
  cholesterol?: number | null;
  strength_days?: number | null;
  strength_sets?: number | null;
  cardio_days?: number | null;
  cardio_minutes?: number | null;
  cardio_miles?: number | null;
};

export type TargetDay = {
  date: string;
  entries: number;
  nutrients: Record<string, number>;
  strength_sets: number;
  strength_volume: number;
  cardio_sessions: number;
  cardio_minutes: number;
  cardio_miles: number;
};

export type BodyWeightRecord = {
  logged_on: string;
  weight: number;
};

export type LiftSet = {
  id: number;
  logged_on: string;
  exercise: string;
  weight: number;
  reps: number;
  created_at: string;
};

export type LiftSetPayload = Omit<LiftSet, "id" | "created_at">;

export type DistanceUnit = "mi" | "km" | "m" | "yd";

export type CardioSession = {
  id: number;
  logged_on: string;
  activity: string;
  duration_minutes: number;
  distance: number | null;
  distance_unit: DistanceUnit;
  average_heart_rate: number | null;
  elevation_gain: number | null;
  perceived_effort: number | null;
  notes: string | null;
  created_at: string;
};

export type CardioSessionPayload = Omit<CardioSession, "id" | "created_at">;

export type HistoryExport = {
  schema_version: number;
  source: string;
  exported_at: string;
  date_range: { start_date: string; end_date: string; inclusive: boolean };
  units: Record<string, string | Record<string, string>>;
  notes: string[];
  days: Array<{
    date: string;
    bodyweight: number | null;
    food_entries: FoodEntry[];
    nutrition_totals: Record<string, number> | null;
    training: { strength_sets: LiftSet[]; cardio_sessions: CardioSession[] };
  }>;
};

export type TensionAllocation = { muscle: string; percent: number; heads?: Record<string, number> };
export type ExerciseTension = { exercise: string; allocations: TensionAllocation[] };
