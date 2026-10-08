import unittest
from datetime import date

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import Base
from app.main import create_meal, list_meals, log_meal, update_meal


class MealTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, autoflush=False, expire_on_commit=False)
        self.foods = [
            models.SavedFood(name="Yogurt", calories=100, protein=10),
            models.SavedFood(name="Oats", calories=200, protein=5),
            models.SavedFood(name="Berries", calories=50, protein=1),
        ]
        self.db.add_all(self.foods)
        self.db.commit()
        self.meal = create_meal(schemas.MealCreate(
            name="Breakfast",
            items=[{"food_id": food.id, "quantity": 1} for food in self.foods[:2]],
        ), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_update_persists_name_foods_quantities_and_totals(self):
        logged = log_meal(self.meal.id, schemas.AddToLogRequest(
            eaten_on=date(2026, 9, 15),
        ), self.db)
        updated = update_meal(self.meal.id, schemas.MealCreate(
            name="Yogurt bowl",
            items=[
                {"food_id": self.foods[0].id, "quantity": 1.5},
                {"food_id": self.foods[2].id, "quantity": 2},
            ],
        ), self.db)
        self.assertEqual(updated.id, self.meal.id)
        self.assertEqual(updated.created_at, self.meal.created_at)
        self.db.expire_all()
        meals = list_meals(self.db)
        self.assertEqual(len(meals), 1)
        self.assertEqual(meals[0].name, "Yogurt bowl")
        self.assertEqual(
            {item.food.id: item.quantity for item in meals[0].items},
            {self.foods[0].id: 1.5, self.foods[2].id: 2},
        )
        self.assertEqual(meals[0].calories, 250)
        self.assertEqual(meals[0].protein, 17)
        self.assertEqual(len(list(self.db.scalars(select(models.MealItem)))), 2)
        self.assertEqual(sum(entry.calories for entry in logged), 300)
        self.assertEqual(logged[0].name, "Breakfast · Yogurt")
        new_entries = log_meal(self.meal.id, schemas.AddToLogRequest(
            eaten_on=date(2026, 9, 16),
        ), self.db)
        self.assertEqual(sum(entry.calories for entry in new_entries), 250)

    def test_missing_food_does_not_modify_meal(self):
        with self.assertRaises(HTTPException) as caught:
            update_meal(self.meal.id, schemas.MealCreate(
                name="Invalid update",
                items=[{"food_id": 99999, "quantity": 1}],
            ), self.db)
        self.assertEqual(caught.exception.status_code, 400)
        self.db.commit()
        self.db.expire_all()
        meal = list_meals(self.db)[0]
        self.assertEqual(meal.name, "Breakfast")
        self.assertEqual(len(meal.items), 2)
        self.assertEqual(meal.calories, 300)

    def test_missing_meal_returns_not_found(self):
        with self.assertRaises(HTTPException) as caught:
            update_meal(99999, schemas.MealCreate(
                name="Missing meal",
                items=[{"food_id": self.foods[0].id, "quantity": 1}],
            ), self.db)
        self.assertEqual(caught.exception.status_code, 404)

    def test_empty_meal_and_nonpositive_servings_are_rejected(self):
        for items in ([], [{"food_id": self.foods[0].id, "quantity": 0}]):
            with self.assertRaises(ValidationError):
                schemas.MealCreate(name="Breakfast", items=items)


if __name__ == "__main__":
    unittest.main()
