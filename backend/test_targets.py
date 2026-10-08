import unittest
from datetime import date

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import Base
from app.main import get_targets, update_targets, target_history


class TargetTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_existing_targets_and_optional_limits_persist(self):
        self.db.add(models.NutritionTarget(id=1, calories=2400, protein=170, carbohydrates=250, fat=80))
        self.db.commit()
        original = get_targets(self.db)
        self.assertEqual(original["calories"], 2400)
        updated = update_targets(schemas.NutritionTargetBase(**original, added_sugars=0, cardio_minutes=150, strength_days=3), self.db)
        self.assertEqual(updated["added_sugars"], 0)
        self.db.expire_all()
        self.assertEqual(get_targets(self.db)["cardio_minutes"], 150)
        basic = {key: updated[key] for key in ("calories", "protein", "carbohydrates", "fat")}
        update_targets(schemas.NutritionTargetBase(**basic), self.db)
        self.assertEqual(get_targets(self.db)["strength_days"], 3)
        update_targets(schemas.NutritionTargetBase(**basic, added_sugars=None), self.db)
        self.assertIsNone(get_targets(self.db)["added_sugars"])

    def test_history_nutrients_training_units_and_missing_days(self):
        day = date(2026, 9, 7)
        self.db.add_all([
            models.FoodEntry(eaten_on=day, calories=200, protein=10, added_sugars=5, saturated_fat=2),
            models.FoodEntry(eaten_on=day, calories=100, protein=5, added_sugars=3),
            models.LiftSet(logged_on=day, exercise="Squat", weight=100, reps=5),
            models.CardioSession(logged_on=day, activity="Run", duration_minutes=20, distance=1.609344, distance_unit="km"),
            models.CardioSession(logged_on=day, activity="Walk", duration_minutes=10, distance=None),
        ])
        self.db.commit()
        history = target_history(day, date(2026, 9, 8), self.db)
        self.assertEqual(history[0]["nutrients"]["added_sugars"], 8)
        self.assertEqual(history[0]["nutrients"]["calories"], 300)
        self.assertEqual(history[0]["strength_volume"], 500)
        self.assertEqual(history[0]["cardio_minutes"], 30)
        self.assertAlmostEqual(history[0]["cardio_miles"], 1)
        self.assertEqual(history[1]["entries"], 0)

    def test_invalid_goals_and_ranges_rejected(self):
        basic = dict(calories=2000, protein=150, carbohydrates=200, fat=60)
        for extra in (dict(strength_days=8), dict(saturated_fat=-1), dict(cardio_minutes=float("inf"))):
            with self.assertRaises(ValidationError):
                schemas.NutritionTargetBase(**basic, **extra)
        with self.assertRaises(HTTPException):
            target_history(date(2026, 9, 9), date(2026, 9, 8), self.db)


if __name__ == "__main__":
    unittest.main()
