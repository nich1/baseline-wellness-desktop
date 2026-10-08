import unittest
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import Base
from app.main import list_entries, reorder_entries, create_entry, update_entry, delete_entry, copy_to_today


class EntryOrderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.day = date(2026, 10, 6)
        self.other = date(2026, 10, 7)
        for name in ['Breakfast', 'Lunch', 'Dinner']:
            create_entry(schemas.FoodEntryCreate(name=name, eaten_on=self.day, calories=100, protein=10), self.db)
        create_entry(schemas.FoodEntryCreate(name='Other day', eaten_on=self.other, calories=50, protein=5), self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def ids(self, day=None):
        return [entry.id for entry in list_entries(day or self.day, self.db).entries]

    def order(self, ids):
        reorder_entries(schemas.FoodEntryOrder(eaten_on=self.day, entry_ids=ids), self.db)

    def test_persists_only_order_and_leaves_other_day_and_totals_unchanged(self):
        before = list_entries(self.day, self.db).model_dump()
        other = list_entries(self.other, self.db).model_dump()
        self.order([2, 3, 1])
        self.db.close()
        self.db = Session(self.engine)
        after = list_entries(self.day, self.db).model_dump()
        self.assertEqual(self.ids(), [2, 3, 1])
        self.assertEqual(after['totals'], before['totals'])
        self.assertEqual(sorted(after['entries'], key=lambda x: x['id']), sorted(before['entries'], key=lambda x: x['id']))
        self.assertEqual(list_entries(self.other, self.db).model_dump(), other)

    def test_invalid_duplicate_missing_foreign_and_stale_ids_do_not_change_order(self):
        with self.assertRaises(ValidationError):
            schemas.FoodEntryOrder(eaten_on=self.day, entry_ids=[1, 1, 2])
        for ids in ([1, 2], [1, 2, 4], [1, 2, 3, 999], []):
            with self.subTest(ids=ids):
                with self.assertRaises(HTTPException) as caught:
                    self.order(ids)
                self.assertEqual(caught.exception.status_code, 409)
                self.db.rollback()
                self.assertEqual(self.ids(), [3, 2, 1])

    def test_new_entries_prepend_and_edit_delete_preserve_custom_order(self):
        self.order([2, 1, 3])
        new = create_entry(schemas.FoodEntryCreate(name='Snack', eaten_on=self.day, calories=25, protein=1), self.db)
        self.assertEqual(self.ids(), [new.id, 2, 1, 3])
        update_entry(1, schemas.FoodEntryUpdate(name='Edited breakfast', eaten_on=self.day, calories=200, protein=20), self.db)
        self.assertEqual(self.ids(), [new.id, 2, 1, 3])
        delete_entry(2, self.db)
        self.assertEqual(self.ids(), [new.id, 1, 3])
        update_entry(1, schemas.FoodEntryUpdate(name='Moved', eaten_on=self.other, calories=200, protein=20), self.db)
        self.assertIsNone(self.db.get(models.FoodEntry, 1).position)

    def test_copy_retains_display_order_without_changing_existing_target_order(self):
        self.order([2, 1, 3])
        reorder_entries(schemas.FoodEntryOrder(eaten_on=self.other, entry_ids=[4]), self.db)
        with patch('app.main.app_today', return_value=self.other):
            copy_to_today(schemas.CopyToTodayRequest(source_date=self.day, category='food'), self.db)
        self.assertEqual([entry.name for entry in list_entries(self.other, self.db).entries], ['Lunch', 'Breakfast', 'Dinner', 'Other day'])
        self.assertEqual(self.ids(), [2, 1, 3])


if __name__ == '__main__':
    unittest.main()
