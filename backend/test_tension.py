import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.schemas import ExerciseTensionWrite
from app.main import list_exercise_tensions, save_exercise_tension


class TensionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def profile(self, exercise="Bench press", pairs=None):
        return ExerciseTensionWrite(exercise=exercise, allocations=[
            dict(muscle=muscle, percent=percent)
            for muscle, percent in (pairs if pairs is not None else [
                ("chest", 50), ("triceps", 30), ("front_delts", 20)
            ])
        ])

    def test_roundtrip_updates_and_exercise_isolation(self):
        profile = self.profile()
        save_exercise_tension(profile, self.db)
        save_exercise_tension(self.profile("Squat", [("quads", 100)]), self.db)
        self.db.expire_all()
        rows = list_exercise_tensions(self.db)
        self.assertEqual(ExerciseTensionWrite.model_validate(rows[0]), profile)
        save_exercise_tension(self.profile(pairs=[("chest", 100)]), self.db)
        self.db.expire_all()
        rows = list_exercise_tensions(self.db)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].allocations, [dict(muscle="chest", percent=100, heads={})])
        self.assertEqual(rows[1].allocations, [dict(muscle="quads", percent=100, heads={})])

    def test_invalid_allocations_rejected(self):
        for pairs in [
            [("chest", 51), ("triceps", 30), ("front_delts", 20)],
            [("chest", 50), ("chest", 20)],
            [("chest", -1)], [("chest", 101)], [("unknown", 20)],
            [("chest", 1.5)], [("chest", float("nan"))],
            [("chest", float("inf"))], [("chest", True)],
        ]:
            with self.subTest(pairs=pairs), self.assertRaises(ValidationError):
                self.profile(pairs=pairs)
        with self.assertRaises(ValidationError):
            self.profile(exercise="   ")

    def test_partial_allocations_cannot_be_saved(self):
        for pairs in [[], [("rear_delts", 70)], [("chest", 0)], [("chest", 40)]]:
            with self.assertRaises(ValidationError):
                self.profile(pairs=pairs)
        self.profile(pairs=[("chest", 100)])

    def test_head_overrides_persist_and_validate(self):
        for muscle, heads in [("chest", {"clavicular": 70}), ("triceps", {"long": 30, "lateral": 30})]:
            payload = ExerciseTensionWrite(exercise=muscle, allocations=[dict(muscle=muscle, percent=100, heads=heads)])
            save_exercise_tension(payload, self.db)
            self.db.expire_all()
            stored = next(row for row in list_exercise_tensions(self.db) if row.exercise == muscle)
            self.assertEqual(ExerciseTensionWrite.model_validate(stored), payload)
        for muscle, heads in [
            ("rear_delts", {"long": 30}), ("chest", {"long": 30}),
            ("chest", {"clavicular": -1}), ("chest", {"clavicular": 1.5}),
            ("triceps", {"long": 70, "lateral": 40}),
            ("triceps", {"long": 30, "lateral": 30, "medial": 30}),
        ]:
            with self.subTest(heads=heads), self.assertRaises(ValidationError):
                ExerciseTensionWrite(exercise="test", allocations=[dict(muscle=muscle, percent=100, heads=heads)])

    def test_all_region_groups_persist_and_delts_stay_separate(self):
        from app.schemas import MUSCLE_REGIONS
        self.assertEqual(len(MUSCLE_REGIONS), 16)
        for muscle, regions in MUSCLE_REGIONS.items():
            heads = {sorted(regions)[0]: 70}
            payload = ExerciseTensionWrite(exercise=muscle, allocations=[dict(muscle=muscle, percent=100, heads=heads)])
            save_exercise_tension(payload, self.db)
            self.db.expire_all()
            stored = next(row for row in list_exercise_tensions(self.db) if row.exercise == muscle)
            self.assertEqual(ExerciseTensionWrite.model_validate(stored), payload)
        for muscle in ["front_delts", "side_delts", "rear_delts"]:
            self.assertNotIn(muscle, MUSCLE_REGIONS)
            with self.assertRaises(ValidationError):
                ExerciseTensionWrite(exercise=muscle, allocations=[dict(muscle=muscle, percent=100, heads={"upper": 70})])

    def test_brachialis_is_a_separate_saved_allocation(self):
        profile = self.profile("Curl", [("biceps", 60), ("brachialis", 30), ("forearms", 10)])
        save_exercise_tension(profile, self.db)
        self.db.expire_all()
        self.assertEqual(ExerciseTensionWrite.model_validate(list_exercise_tensions(self.db)[0]), profile)

    def test_legacy_partial_profiles_remain_readable(self):
        from app.models import ExerciseTension
        from app.schemas import ExerciseTensionRead
        legacy = ExerciseTension(exercise="Old exercise", allocations=[dict(muscle="rear_delts", percent=70)])
        self.db.add(legacy)
        self.db.commit()
        self.assertEqual(ExerciseTensionRead.model_validate(list_exercise_tensions(self.db)[0]).allocations[0].percent, 70)



if __name__ == "__main__":
    unittest.main()
