import json
import unittest
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.database import Base
from app.main import NUTRIENT_FIELDS, export_history


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.start = date(2026, 9, 1)
        self.end = date(2026, 9, 3)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_inclusive_dates_complete_nutrients_and_training(self):
        nutrients = {key: index + 0.25 for index, key in enumerate(NUTRIENT_FIELDS)}
        self.db.add_all([
            models.BodyWeightLog(logged_on=self.start, weight=180.5),
            models.BodyWeightLog(logged_on=self.end, weight=179.8),
            models.FoodEntry(eaten_on=self.start, name="Lunch · Beef", serving="112 g", quantity=1.5, **nutrients),
            models.FoodEntry(eaten_on=self.start, name="Beans", serving="100 g", quantity=0.5, **nutrients),
            models.FoodEntry(eaten_on=self.end, name="Dinner", calories=300, protein=25),
            models.LiftSet(logged_on=self.start, exercise="Squat", weight=135.5, reps=8),
            models.LiftSet(logged_on=self.start, exercise="Squat", weight=145, reps=5),
            models.CardioSession(logged_on=self.end, activity="Run", duration_minutes=25.5,
                distance=5, distance_unit="km", average_heart_rate=145, elevation_gain=30,
                perceived_effort=6, notes="Easy pace"),
        ])
        self.db.commit()
        result = export_history(self.start, self.end, self.db)
        json.dumps(result, allow_nan=False)
        self.assertEqual(result["date_range"], {"start_date": "2026-09-01", "end_date": "2026-09-03", "inclusive": True})
        first, empty, last = result["days"]
        self.assertEqual(first["bodyweight"], 180.5)
        self.assertEqual(last["bodyweight"], 179.8)
        self.assertEqual(first["food_entries"][0]["name"], "Lunch · Beef")
        self.assertEqual(first["food_entries"][0]["quantity"], 1.5)
        self.assertEqual(first["nutrition_totals"], {key: value * 2 for key, value in nutrients.items()})
        self.assertEqual([s["reps"] for s in first["training"]["strength_sets"]], [8, 5])
        cardio = last["training"]["cardio_sessions"][0]
        self.assertEqual(cardio["distance_unit"], "km")
        self.assertEqual(cardio["duration_minutes"], 25.5)
        self.assertEqual(cardio["average_heart_rate"], 145)
        self.assertEqual(cardio["elevation_gain"], 30)
        self.assertEqual(cardio["perceived_effort"], 6)
        self.assertEqual(cardio["notes"], "Easy pace")
        self.assertEqual(empty, {"date": "2026-09-02", "bodyweight": None, "food_entries": [],
            "nutrition_totals": None, "training": {"strength_sets": [], "cardio_sessions": []}})
        self.assertEqual(result["units"]["bodyweight"], "lb")
        for key in NUTRIENT_FIELDS:
            expected = "kcal" if key == "calories" else "mg" if key in ("sodium", "potassium", "cholesterol") else "g"
            self.assertEqual(result["units"]["nutrition"][key], expected)
        self.assertIsNotNone(datetime.fromisoformat(result["exported_at"]).tzinfo)

    def test_excludes_records_outside_range_for_every_record_type(self):
        for day in (date(2026, 8, 31), date(2026, 9, 4)):
            self.db.add_all([
                models.BodyWeightLog(logged_on=day, weight=200),
                models.FoodEntry(eaten_on=day, calories=500, protein=20),
                models.LiftSet(logged_on=day, exercise="Press", weight=100, reps=5),
                models.CardioSession(logged_on=day, activity="Walk", duration_minutes=30),
            ])
        self.db.commit()
        for day in export_history(self.start, self.end, self.db)["days"]:
            self.assertIsNone(day["bodyweight"])
            self.assertIsNone(day["nutrition_totals"])
            self.assertEqual(day["food_entries"], [])
            self.assertEqual(day["training"], {"strength_sets": [], "cardio_sessions": []})

    def test_single_day_zero_intake_is_distinct_from_missing(self):
        self.db.add(models.FoodEntry(eaten_on=self.start, name="Water", calories=0, protein=0))
        self.db.commit()
        days = export_history(self.start, self.start, self.db)["days"]
        self.assertEqual(len(days), 1)
        self.assertEqual(days[0]["nutrition_totals"], dict.fromkeys(NUTRIENT_FIELDS, 0))

    def test_empty_export_does_not_create_data_and_handles_last_possible_date(self):
        result = export_history(date.max, date.max, self.db)
        self.assertEqual(result["days"][0]["date"], "9999-12-31")
        self.assertEqual(self.db.query(models.NutritionTarget).count(), 0)
        self.assertEqual(self.db.query(models.FoodEntry).count(), 0)

    def test_invalid_or_excessive_ranges_rejected(self):
        for start, end in ((self.end, self.start), (date(2000, 1, 1), self.end)):
            with self.assertRaises(HTTPException) as caught:
                export_history(start, end, self.db)
            self.assertEqual(caught.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
