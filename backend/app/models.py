from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class FoodEntry(Base):
    __tablename__ = "food_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), default="Untitled food")
    serving: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[float] = mapped_column(default=1)
    eaten_on: Mapped[date] = mapped_column(Date, index=True)
    position: Mapped[int | None] = mapped_column(nullable=True)

    calories: Mapped[float]
    protein: Mapped[float]
    carbohydrates: Mapped[float] = mapped_column(default=0)
    fiber: Mapped[float] = mapped_column(default=0)
    sugars: Mapped[float] = mapped_column(default=0)
    added_sugars: Mapped[float] = mapped_column(default=0)
    sugar_alcohols: Mapped[float] = mapped_column(default=0)
    fat: Mapped[float] = mapped_column(default=0)
    saturated_fat: Mapped[float] = mapped_column(default=0)
    trans_fat: Mapped[float] = mapped_column(default=0)
    monounsaturated_fat: Mapped[float] = mapped_column(default=0)
    polyunsaturated_fat: Mapped[float] = mapped_column(default=0)
    cholesterol: Mapped[float] = mapped_column(default=0)
    sodium: Mapped[float] = mapped_column(default=0)
    potassium: Mapped[float] = mapped_column(default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SavedFood(Base):
    __tablename__ = "saved_foods"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    serving: Mapped[str | None] = mapped_column(String(80), nullable=True)
    calories: Mapped[float]
    protein: Mapped[float]
    carbohydrates: Mapped[float] = mapped_column(default=0)
    fiber: Mapped[float] = mapped_column(default=0)
    sugars: Mapped[float] = mapped_column(default=0)
    added_sugars: Mapped[float] = mapped_column(default=0)
    sugar_alcohols: Mapped[float] = mapped_column(default=0)
    fat: Mapped[float] = mapped_column(default=0)
    saturated_fat: Mapped[float] = mapped_column(default=0)
    trans_fat: Mapped[float] = mapped_column(default=0)
    monounsaturated_fat: Mapped[float] = mapped_column(default=0)
    polyunsaturated_fat: Mapped[float] = mapped_column(default=0)
    cholesterol: Mapped[float] = mapped_column(default=0)
    sodium: Mapped[float] = mapped_column(default=0)
    potassium: Mapped[float] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    items: Mapped[list["MealItem"]] = relationship(
        back_populates="meal",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class MealItem(Base):
    __tablename__ = "meal_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_id: Mapped[int] = mapped_column(
        ForeignKey("meals.id", ondelete="CASCADE"), index=True
    )
    food_id: Mapped[int] = mapped_column(
        ForeignKey("saved_foods.id", ondelete="CASCADE"), index=True
    )
    quantity: Mapped[float] = mapped_column(default=1)
    meal: Mapped[Meal] = relationship(back_populates="items")
    food: Mapped[SavedFood] = relationship(lazy="joined")


class NutritionTarget(Base):
    __tablename__ = "nutrition_targets"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    calories: Mapped[float] = mapped_column(default=2200)
    protein: Mapped[float] = mapped_column(default=160)
    carbohydrates: Mapped[float] = mapped_column(default=250)
    fat: Mapped[float] = mapped_column(default=75)


class TargetPreferences(Base):
    __tablename__ = "target_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    values: Mapped[dict] = mapped_column(JSON, default=dict)


class BodyWeightLog(Base):
    __tablename__ = "bodyweight_logs"

    logged_on: Mapped[date] = mapped_column(Date, primary_key=True)
    weight: Mapped[float]


class BodyWeightGoal(Base):
    __tablename__ = "bodyweight_goals"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    weight: Mapped[float]


class LiftSet(Base):
    __tablename__ = "lift_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    logged_on: Mapped[date] = mapped_column(Date, index=True)
    exercise: Mapped[str] = mapped_column(String(120), index=True)
    weight: Mapped[float]
    reps: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CardioSession(Base):
    __tablename__ = "cardio_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    logged_on: Mapped[date] = mapped_column(Date, index=True)
    activity: Mapped[str] = mapped_column(String(80), index=True)
    duration_minutes: Mapped[float]
    distance: Mapped[float | None] = mapped_column(nullable=True)
    distance_unit: Mapped[str] = mapped_column(String(4), default="mi")
    average_heart_rate: Mapped[int | None] = mapped_column(nullable=True)
    elevation_gain: Mapped[float | None] = mapped_column(nullable=True)
    perceived_effort: Mapped[int | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ExerciseTension(Base):
    __tablename__ = "exercise_tensions"

    exercise: Mapped[str] = mapped_column(String(120), primary_key=True)
    allocations: Mapped[list] = mapped_column(JSON, default=list)
