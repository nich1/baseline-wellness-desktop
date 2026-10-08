import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import Base
from app.main import NUTRIENT_FIELDS, app_today, copy_to_today


class CopyToTodayTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, expire_on_commit=False)
        self.today = date(2026, 9, 27)
        self.source = date(2026, 9, 25)
        self.clock = patch("app.main.app_today", return_value=self.today)
        self.clock.start()
        self.models = [models.FoodEntry, models.LiftSet, models.CardioSession]
        for day in (self.source, self.today, date(2026, 9, 24)):
            self.db.add_all([
                models.FoodEntry(eaten_on=day, name="Lunch · Beef", serving="4 oz (112 g), raw", quantity=1.5,
                    **{key: index + 0.25 for index, key in enumerate(NUTRIENT_FIELDS)}),
                models.LiftSet(logged_on=day, exercise="Squat", weight=135.5, reps=8),
                models.CardioSession(logged_on=day, activity="Run", duration_minutes=25.5,
                    distance=5, distance_unit="km", average_heart_rate=145, elevation_gain=30,
                    perceived_effort=6, notes="Easy pace"),
                models.BodyWeightLog(logged_on=day, weight=180.5),
            ])
        self.db.commit()

    def tearDown(self):
        self.clock.stop()
        self.db.close()
        self.engine.dispose()

    def rows(self, model):
        return [{column.name: getattr(row, column.name) for column in model.__table__.columns}
                for row in self.db.scalars(select(model).order_by(model.id))]

    def test_each_category_appends_and_preserves_all_fields_and_other_records(self):
        for category, model, day_field in (
            ("food", models.FoodEntry, "eaten_on"),
            ("lifts", models.LiftSet, "logged_on"),
            ("cardio", models.CardioSession, "logged_on"),
        ):
            with self.subTest(category=category):
                before = {table: self.rows(table) for table in self.models}
                result = copy_to_today(schemas.CopyToTodayRequest(source_date=self.source, category=category), self.db)
                self.assertEqual(result["copied_count"], 1)
                self.assertEqual(result["target_date"], self.today)
                after = self.rows(model)
                self.assertEqual(after[:-1], before[model])
                copied = after[-1]
                source = next(row for row in before[model] if row[day_field] == self.source)
                self.assertNotEqual(copied["id"], source["id"])
                self.assertEqual(copied[day_field], self.today)
                for field in source.keys() - {"id", "created_at", day_field}:
                    self.assertEqual(copied[field], source[field], field)
                self.assertIsNotNone(copied["created_at"])
                for other in self.models:
                    if other != model:
                        self.assertEqual(self.rows(other), before[other])
                self.assertEqual(self.db.get(models.BodyWeightLog, self.today).weight, 180.5)
                self.assertEqual(self.db.query(models.BodyWeightLog).count(), 3)

    def test_copies_every_source_record_and_appends_on_subsequent_requests(self):
        self.db.add(models.FoodEntry(eaten_on=self.source, name="Rice", quantity=0.5, calories=100, protein=2))
        self.db.commit()
        payload = schemas.CopyToTodayRequest(source_date=self.source, category="food")
        for expected in (3, 5):
            result = copy_to_today(payload, self.db)
            self.assertEqual(result["copied_count"], 2)
            self.assertEqual(self.db.query(models.FoodEntry).filter_by(eaten_on=self.today).count(), expected)

    def test_empty_source_does_not_change_any_records(self):
        for category in ("food", "lifts", "cardio"):
            result = copy_to_today(schemas.CopyToTodayRequest(source_date=date(2020, 1, 1), category=category), self.db)
            self.assertEqual(result["copied_count"], 0)
        for model in self.models:
            self.assertEqual(len(self.rows(model)), 3)

    def test_today_and_unknown_categories_are_rejected(self):
        with self.assertRaises(HTTPException) as caught:
            copy_to_today(schemas.CopyToTodayRequest(source_date=self.today, category="food"), self.db)
        self.assertEqual(caught.exception.status_code, 422)
        with self.assertRaises(ValidationError):
            schemas.CopyToTodayRequest(source_date=self.source, category="bodyweight")
        self.assertEqual(len(self.rows(models.FoodEntry)), 3)

    def test_failed_commit_rolls_back_the_entire_copy(self):
        self.db.add(models.FoodEntry(eaten_on=self.source, calories=50, protein=5))
        self.db.commit()
        before = self.rows(models.FoodEntry)

        def fail_after_flush():
            self.db.flush()
            raise RuntimeError("Simulated database failure")

        with patch.object(self.db, "commit", side_effect=fail_after_flush):
            with self.assertRaises(RuntimeError):
                copy_to_today(schemas.CopyToTodayRequest(source_date=self.source, category="food"), self.db)
        self.assertEqual(self.rows(models.FoodEntry), before)

    def test_today_uses_chicago_calendar_date_near_utc_midnight(self):
        with patch("app.main.datetime") as clock:
            clock.now.side_effect = lambda tz: datetime(2026, 9, 28, 2, tzinfo=timezone.utc).astimezone(tz)
            self.assertEqual(app_today(), date(2026, 9, 27))


if __name__ == "__main__":
    unittest.main()
