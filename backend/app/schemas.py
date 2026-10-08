from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CopyToTodayRequest(BaseModel):
    source_date: date
    category: Literal["food", "lifts", "cardio"]


class CopyToTodayResult(CopyToTodayRequest):
    target_date: date
    copied_count: int


class FoodEntryBase(BaseModel):
    name: str = Field(default="Untitled food", min_length=1, max_length=160)
    serving: str | None = Field(default=None, max_length=80)
    quantity: float = Field(default=1, gt=0)
    eaten_on: date
    calories: float = Field(ge=0)
    protein: float = Field(ge=0)
    carbohydrates: float = Field(default=0, ge=0)
    fiber: float = Field(default=0, ge=0)
    sugars: float = Field(default=0, ge=0)
    added_sugars: float = Field(default=0, ge=0)
    sugar_alcohols: float = Field(default=0, ge=0)
    fat: float = Field(default=0, ge=0)
    saturated_fat: float = Field(default=0, ge=0)
    trans_fat: float = Field(default=0, ge=0)
    monounsaturated_fat: float = Field(default=0, ge=0)
    polyunsaturated_fat: float = Field(default=0, ge=0)
    cholesterol: float = Field(default=0, ge=0)
    sodium: float = Field(default=0, ge=0)
    potassium: float = Field(default=0, ge=0)


class FoodEntryCreate(FoodEntryBase):
    pass


class FoodEntryUpdate(FoodEntryBase):
    pass


class FoodEntryOrder(BaseModel):
    eaten_on: date
    entry_ids: list[Annotated[int, Field(gt=0)]]

    @model_validator(mode="after")
    def unique_entries(self):
        if len(self.entry_ids) != len(set(self.entry_ids)):
            raise ValueError("Each entry must appear exactly once")
        return self


class FoodEntryRead(FoodEntryBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NutritionTotals(BaseModel):
    calories: float = 0
    protein: float = 0
    carbohydrates: float = 0
    fiber: float = 0
    sugars: float = 0
    fat: float = 0
    saturated_fat: float = 0
    sodium: float = 0


class DailyLog(BaseModel):
    date: date
    entries: list[FoodEntryRead]
    totals: NutritionTotals
    bodyweight: float | None = None


class SavedFoodBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    serving: str | None = Field(default=None, max_length=80)
    calories: float = Field(ge=0)
    protein: float = Field(ge=0)
    carbohydrates: float = Field(default=0, ge=0)
    fiber: float = Field(default=0, ge=0)
    sugars: float = Field(default=0, ge=0)
    added_sugars: float = Field(default=0, ge=0)
    sugar_alcohols: float = Field(default=0, ge=0)
    fat: float = Field(default=0, ge=0)
    saturated_fat: float = Field(default=0, ge=0)
    trans_fat: float = Field(default=0, ge=0)
    monounsaturated_fat: float = Field(default=0, ge=0)
    polyunsaturated_fat: float = Field(default=0, ge=0)
    cholesterol: float = Field(default=0, ge=0)
    sodium: float = Field(default=0, ge=0)
    potassium: float = Field(default=0, ge=0)


class SavedFoodCreate(SavedFoodBase):
    pass


class SavedFoodRead(SavedFoodBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MealItemCreate(BaseModel):
    food_id: int
    quantity: float = Field(default=1, gt=0)


class MealCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    items: list[MealItemCreate] = Field(min_length=1)


class MealItemRead(BaseModel):
    id: int
    quantity: float
    food: SavedFoodRead

    model_config = ConfigDict(from_attributes=True)


class MealRead(BaseModel):
    id: int
    name: str
    created_at: datetime
    items: list[MealItemRead]
    calories: float
    protein: float


class AddToLogRequest(BaseModel):
    eaten_on: date
    quantity: float = Field(default=1, gt=0)


class NutritionTargetBase(BaseModel):
    calories: float = Field(gt=0)
    protein: float = Field(gt=0)
    carbohydrates: float = Field(gt=0)
    fat: float = Field(gt=0)
    fiber: float | None = Field(default=None, gt=0)
    potassium: float | None = Field(default=None, gt=0)
    saturated_fat: float | None = Field(default=None, ge=0)
    added_sugars: float | None = Field(default=None, ge=0)
    sugars: float | None = Field(default=None, ge=0)
    sodium: float | None = Field(default=None, ge=0)
    cholesterol: float | None = Field(default=None, ge=0)
    strength_days: int | None = Field(default=None, ge=1, le=7)
    strength_sets: int | None = Field(default=None, gt=0)
    cardio_days: int | None = Field(default=None, ge=1, le=7)
    cardio_minutes: float | None = Field(default=None, gt=0)
    cardio_miles: float | None = Field(default=None, gt=0)

    model_config = ConfigDict(allow_inf_nan=False)


class NutritionTargetRead(NutritionTargetBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class BodyWeightUpdate(BaseModel):
    weight: float = Field(gt=0)


class BodyWeightRead(BodyWeightUpdate):
    logged_on: date

    model_config = ConfigDict(from_attributes=True)


class BodyWeightGoalRead(BodyWeightUpdate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class LiftSetBase(BaseModel):
    logged_on: date
    exercise: str = Field(min_length=1, max_length=120)
    weight: float = Field(gt=0)
    reps: int = Field(gt=0, le=100)


class LiftSetCreate(LiftSetBase):
    pass


class LiftSetRead(LiftSetBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CardioSessionBase(BaseModel):
    logged_on: date
    activity: str = Field(min_length=1, max_length=80)
    duration_minutes: float = Field(gt=0, le=1440)
    distance: float | None = Field(default=None, gt=0)
    distance_unit: Literal["mi", "km", "m", "yd"] = "mi"
    average_heart_rate: int | None = Field(default=None, ge=30, le=250)
    elevation_gain: float | None = Field(default=None, ge=0)
    perceived_effort: int | None = Field(default=None, ge=1, le=10)
    notes: str | None = Field(default=None, max_length=500)


class CardioSessionCreate(CardioSessionBase):
    pass


class CardioSessionRead(CardioSessionBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


MuscleGroup = Literal[
    "chest", "lats", "upper_back", "lower_back", "traps",
    "front_delts", "side_delts", "rear_delts", "biceps", "brachialis", "triceps",
    "forearms", "abs", "obliques", "glutes", "quads", "hamstrings",
    "adductors", "abductors", "calves",
]


MUSCLE_REGIONS = {
    "chest": {"clavicular", "middle", "lower"},
    "triceps": {"long", "lateral", "medial"},
    "lats": {"upper", "lower"},
    "upper_back": {"rhomboids", "teres_major", "infraspinatus", "teres_minor"},
    "lower_back": {"erector_spinae", "multifidus", "quadratus_lumborum"},
    "traps": {"upper", "middle", "lower"},
    "biceps": {"long", "short"},
    "forearms": {"flexors", "extensors", "brachioradialis", "pronators", "supinator"},
    "abs": {"upper", "lower", "transverse"},
    "obliques": {"external", "internal"},
    "glutes": {"maximus", "medius", "minimus"},
    "quads": {"rectus_femoris", "vastus_lateralis", "vastus_medialis", "vastus_intermedius"},
    "hamstrings": {"biceps_femoris_long", "biceps_femoris_short", "semitendinosus", "semimembranosus"},
    "adductors": {"magnus", "longus", "brevis", "gracilis", "pectineus"},
    "abductors": {"medius", "minimus", "tfl"},
    "calves": {"gastrocnemius_medial", "gastrocnemius_lateral", "soleus"},
}


class TensionAllocation(BaseModel):
    muscle: MuscleGroup
    percent: int = Field(ge=0, le=100, strict=True)
    heads: dict[str, Annotated[int, Field(ge=0, le=100, strict=True)]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_heads(self):
        allowed = MUSCLE_REGIONS.get(self.muscle, set())
        if not set(self.heads).issubset(allowed):
            raise ValueError("Invalid head or region for this muscle")
        total = sum(self.heads.values())
        if total > 100:
            raise ValueError("Head distribution cannot exceed 100%")
        if allowed and len(self.heads) == len(allowed) and total != 100:
            raise ValueError("Fully specified head distributions must total 100%")
        return self


class ExerciseTensionRead(BaseModel):
    exercise: str = Field(min_length=1, max_length=120)
    allocations: list[TensionAllocation] = Field(max_length=20)

    @model_validator(mode="after")
    def validate_distribution(self):
        if not self.exercise.strip():
            raise ValueError("Exercise name cannot be blank")
        muscles = [item.muscle for item in self.allocations]
        if len(set(muscles)) != len(muscles):
            raise ValueError("Each muscle can only be selected once")
        if sum(item.percent for item in self.allocations) > 100:
            raise ValueError("Total tension cannot exceed 100%")
        return self

    model_config = ConfigDict(from_attributes=True)


class ExerciseTensionWrite(ExerciseTensionRead):
    @model_validator(mode="after")
    def require_complete_distribution(self):
        if sum(item.percent for item in self.allocations) != 100:
            raise ValueError("Total tension must equal 100% to save")
        return self
