from datetime import date, datetime, timedelta, timezone
from contextlib import asynccontextmanager
from math import fsum
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, engine, get_db
from .settings import settings

NUTRIENT_FIELDS = (
    "calories",
    "protein",
    "carbohydrates",
    "fiber",
    "sugars",
    "added_sugars",
    "sugar_alcohols",
    "fat",
    "saturated_fat",
    "trans_fat",
    "monounsaturated_fat",
    "polyunsaturated_fat",
    "cholesterol",
    "sodium",
    "potassium",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE food_entries "
                "ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION NOT NULL DEFAULT 1"
            )
        )
        connection.execute(text("ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS position INTEGER"))
    yield


app = FastAPI(title="Baseline API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def app_today() -> date:
    return datetime.now(ZoneInfo("America/Chicago")).date()


@app.post("/copy-to-today", response_model=schemas.CopyToTodayResult)
def copy_to_today(payload: schemas.CopyToTodayRequest, db: Session = Depends(get_db)) -> dict:
    today = app_today()
    if payload.source_date == today:
        raise HTTPException(status_code=422, detail="Choose a different day to copy records to today.")

    model, schema, date_field = {
        "food": (models.FoodEntry, schemas.FoodEntryBase, models.FoodEntry.eaten_on),
        "lifts": (models.LiftSet, schemas.LiftSetBase, models.LiftSet.logged_on),
        "cardio": (models.CardioSession, schemas.CardioSessionBase, models.CardioSession.logged_on),
    }[payload.category]
    source_order = (model.position.desc().nulls_last(), model.created_at, model.id) if payload.category == "food" else (model.created_at, model.id)
    sources = list(db.scalars(select(model).where(
        date_field == payload.source_date
    ).order_by(*source_order)))
    copies = [model(**{
        field: today if field == date_field.key else getattr(source, field)
        for field in schema.model_fields
    }) for source in sources]
    if copies:
        try:
            db.add_all(copies)
            db.commit()
        except Exception:
            db.rollback()
            raise
    return {
        **payload.model_dump(),
        "target_date": today,
        "copied_count": len(copies),
    }


@app.get("/export")
def export_history(start_date: date, end_date: date, db: Session = Depends(get_db)) -> dict:
    day_count = (end_date - start_date).days + 1
    if day_count <= 0:
        raise HTTPException(status_code=422, detail="End date must be on or after start date.")
    if day_count > 3660:
        raise HTTPException(status_code=422, detail="Choose a range of 3,660 days or fewer per export.")

    days = {
        start_date + timedelta(days=offset): {
            "date": (start_date + timedelta(days=offset)).isoformat(),
            "bodyweight": None,
            "food_entries": [],
            "nutrition_totals": None,
            "training": {"strength_sets": [], "cardio_sessions": []},
        }
        for offset in range(day_count)
    }
    for record in db.scalars(select(models.BodyWeightLog).where(
        models.BodyWeightLog.logged_on.between(start_date, end_date)
    )):
        days[record.logged_on]["bodyweight"] = record.weight

    for model, schema, date_field, key in (
        (models.FoodEntry, schemas.FoodEntryRead, models.FoodEntry.eaten_on, "food_entries"),
        (models.LiftSet, schemas.LiftSetRead, models.LiftSet.logged_on, "strength_sets"),
        (models.CardioSession, schemas.CardioSessionRead, models.CardioSession.logged_on, "cardio_sessions"),
    ):
        records = db.scalars(select(model).where(
            date_field.between(start_date, end_date)
        ).order_by(date_field, model.created_at, model.id))
        for record in records:
            day = days[getattr(record, date_field.key)]
            destination = day if key == "food_entries" else day["training"]
            destination[key].append(schema.model_validate(record).model_dump(mode="json"))

    for day in days.values():
        if day["food_entries"]:
            day["nutrition_totals"] = {
                key: fsum(entry[key] for entry in day["food_entries"])
                for key in NUTRIENT_FIELDS
            }

    return {
        "schema_version": 1,
        "source": "Baseline",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "date_range": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat(), "inclusive": True},
        "units": {
            "bodyweight": "lb",
            "strength_weight": "lb",
            "nutrition": {key: "kcal" if key == "calories" else "mg" if key in ("cholesterol", "sodium", "potassium") else "g" for key in NUTRIENT_FIELDS},
            "cardio_duration": "minutes",
            "cardio_distance": "Each session specifies distance_unit.",
            "cardio_elevation_gain": "ft",
            "cardio_average_heart_rate": "bpm",
            "cardio_perceived_effort": "1–10",
        },
        "notes": [
            "Dates are the calendar dates recorded in Baseline (America/Chicago). Both range endpoints are included.",
            "A null bodyweight means no weigh-in was recorded; weights are not carried forward.",
            "food_entries contains logged foods and meals. Saved meals are logged as individual foods with the meal name prefixed to each food name.",
            "Food entry nutrients are totals for the logged quantity, already scaled; do not multiply them by quantity again.",
            "nutrition_totals sums recorded food entries only. A null total means no food was logged, not zero intake. Logged days may be incomplete, and unspecified nutrients in a food entry are stored as zero.",
            "Empty training arrays mean no training was recorded, not necessarily a rest day. Each strength record is one set.",
        ],
        "days": list(days.values()),
    }


@app.get("/targets", response_model=schemas.NutritionTargetRead)
def get_targets(db: Session = Depends(get_db)) -> dict:
    targets = db.get(models.NutritionTarget, 1)
    if targets is None:
        targets = models.NutritionTarget(id=1)
        db.add(targets)
        db.commit()
        db.refresh(targets)
    preferences = db.get(models.TargetPreferences, 1)
    return {"id": 1, **{key: getattr(targets, key) for key in ("calories", "protein", "carbohydrates", "fat")}, **(preferences.values if preferences else {})}


@app.put("/targets", response_model=schemas.NutritionTargetRead)
def update_targets(
    payload: schemas.NutritionTargetBase,
    db: Session = Depends(get_db),
) -> dict:
    basic = {key: getattr(payload, key) for key in ("calories", "protein", "carbohydrates", "fat")}
    targets = db.get(models.NutritionTarget, 1)
    if targets is None:
        targets = models.NutritionTarget(id=1, **basic)
        db.add(targets)
    else:
        for field, value in basic.items():
            setattr(targets, field, value)
    preferences = db.get(models.TargetPreferences, 1)
    if preferences is None:
        preferences = models.TargetPreferences(id=1)
        db.add(preferences)
    preferences.values = {**(preferences.values or {}), **payload.model_dump(exclude=set(basic), exclude_unset=True)}
    db.commit()
    db.refresh(targets)
    return get_targets(db)


@app.get("/target-history")
def target_history(start_date: date, end_date: date, db: Session = Depends(get_db)) -> list[dict]:
    if end_date < start_date or (end_date - start_date).days > 370:
        raise HTTPException(status_code=422, detail="Choose a range of up to 371 days")
    days = {}
    current = start_date
    while current <= end_date:
        days[current] = {"date": current, "entries": 0, "nutrients": dict.fromkeys(NUTRIENT_FIELDS, 0), "strength_sets": 0, "strength_volume": 0, "cardio_sessions": 0, "cardio_minutes": 0, "cardio_miles": 0}
        current += timedelta(days=1)
    for entry in db.scalars(select(models.FoodEntry).where(models.FoodEntry.eaten_on.between(start_date, end_date))):
        day = days[entry.eaten_on]
        day["entries"] += 1
        for key in NUTRIENT_FIELDS:
            day["nutrients"][key] += getattr(entry, key)
    for lift in db.scalars(select(models.LiftSet).where(models.LiftSet.logged_on.between(start_date, end_date))):
        days[lift.logged_on]["strength_sets"] += 1
        days[lift.logged_on]["strength_volume"] += lift.weight * lift.reps
    miles = {"mi": 1, "km": 1 / 1.609344, "m": 1 / 1609.344, "yd": 1 / 1760}
    for session in db.scalars(select(models.CardioSession).where(models.CardioSession.logged_on.between(start_date, end_date))):
        day = days[session.logged_on]
        day["cardio_sessions"] += 1
        day["cardio_minutes"] += session.duration_minutes
        day["cardio_miles"] += (session.distance or 0) * miles[session.distance_unit]
    return list(days.values())


@app.put("/bodyweight/{logged_on}", response_model=schemas.BodyWeightRead)
def update_bodyweight(
    logged_on: date,
    payload: schemas.BodyWeightUpdate,
    db: Session = Depends(get_db),
) -> models.BodyWeightLog:
    record = db.get(models.BodyWeightLog, logged_on)
    if record is None:
        record = models.BodyWeightLog(logged_on=logged_on, weight=payload.weight)
        db.add(record)
    else:
        record.weight = payload.weight
    db.commit()
    db.refresh(record)
    return record


@app.get("/bodyweight", response_model=list[schemas.BodyWeightRead])
def list_bodyweights(
    start_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[models.BodyWeightLog]:
    query = select(models.BodyWeightLog).order_by(models.BodyWeightLog.logged_on)
    if start_date is not None:
        query = query.where(models.BodyWeightLog.logged_on >= start_date)
    return list(db.scalars(query))


@app.get("/bodyweight-goal", response_model=schemas.BodyWeightGoalRead | None)
def get_bodyweight_goal(
    db: Session = Depends(get_db),
) -> models.BodyWeightGoal | None:
    return db.get(models.BodyWeightGoal, 1)


@app.put("/bodyweight-goal", response_model=schemas.BodyWeightGoalRead)
def update_bodyweight_goal(
    payload: schemas.BodyWeightUpdate,
    db: Session = Depends(get_db),
) -> models.BodyWeightGoal:
    goal = db.get(models.BodyWeightGoal, 1)
    if goal is None:
        goal = models.BodyWeightGoal(id=1, weight=payload.weight)
        db.add(goal)
    else:
        goal.weight = payload.weight
    db.commit()
    db.refresh(goal)
    return goal


@app.delete("/bodyweight/{logged_on}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bodyweight(logged_on: date, db: Session = Depends(get_db)) -> Response:
    record = db.get(models.BodyWeightLog, logged_on)
    if record is not None:
        db.delete(record)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/lifts", response_model=list[schemas.LiftSetRead])
def list_lifts(
    logged_on: date | None = Query(default=None),
    start_date: date | None = Query(default=None),
    exercise: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[models.LiftSet]:
    query = select(models.LiftSet).order_by(
        models.LiftSet.logged_on,
        models.LiftSet.created_at,
    )
    if logged_on is not None:
        query = query.where(models.LiftSet.logged_on == logged_on)
    if start_date is not None:
        query = query.where(models.LiftSet.logged_on >= start_date)
    if exercise is not None:
        query = query.where(models.LiftSet.exercise == exercise)
    return list(db.scalars(query))


@app.post(
    "/lifts",
    response_model=schemas.LiftSetRead,
    status_code=status.HTTP_201_CREATED,
)
def create_lift(
    payload: schemas.LiftSetCreate,
    db: Session = Depends(get_db),
) -> models.LiftSet:
    lift = models.LiftSet(**payload.model_dump())
    db.add(lift)
    db.commit()
    db.refresh(lift)
    return lift


@app.put("/lifts/{lift_id}", response_model=schemas.LiftSetRead)
def update_lift(
    lift_id: int,
    payload: schemas.LiftSetCreate,
    db: Session = Depends(get_db),
) -> models.LiftSet:
    lift = db.get(models.LiftSet, lift_id)
    if lift is None:
        raise HTTPException(status_code=404, detail="Lift set not found")
    for field, value in payload.model_dump().items():
        setattr(lift, field, value)
    db.commit()
    db.refresh(lift)
    return lift


@app.delete("/lifts/{lift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lift(lift_id: int, db: Session = Depends(get_db)) -> Response:
    lift = db.get(models.LiftSet, lift_id)
    if lift is None:
        raise HTTPException(status_code=404, detail="Lift set not found")
    db.delete(lift)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/cardio", response_model=list[schemas.CardioSessionRead])
def list_cardio_sessions(
    logged_on: date | None = Query(default=None),
    start_date: date | None = Query(default=None),
    activity: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[models.CardioSession]:
    query = select(models.CardioSession).order_by(
        models.CardioSession.logged_on,
        models.CardioSession.created_at,
    )
    if logged_on is not None:
        query = query.where(models.CardioSession.logged_on == logged_on)
    if start_date is not None:
        query = query.where(models.CardioSession.logged_on >= start_date)
    if activity is not None:
        query = query.where(models.CardioSession.activity == activity)
    return list(db.scalars(query))


@app.post(
    "/cardio",
    response_model=schemas.CardioSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_cardio_session(
    payload: schemas.CardioSessionCreate,
    db: Session = Depends(get_db),
) -> models.CardioSession:
    session = models.CardioSession(**payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@app.put("/cardio/{session_id}", response_model=schemas.CardioSessionRead)
def update_cardio_session(
    session_id: int,
    payload: schemas.CardioSessionCreate,
    db: Session = Depends(get_db),
) -> models.CardioSession:
    session = db.get(models.CardioSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Cardio session not found")
    for field, value in payload.model_dump().items():
        setattr(session, field, value)
    db.commit()
    db.refresh(session)
    return session


@app.delete("/cardio/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cardio_session(
    session_id: int,
    db: Session = Depends(get_db),
) -> Response:
    session = db.get(models.CardioSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Cardio session not found")
    db.delete(session)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/entries", response_model=schemas.DailyLog)
def list_entries(
    eaten_on: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
) -> schemas.DailyLog:
    entries = list(
        db.scalars(
            select(models.FoodEntry)
            .where(models.FoodEntry.eaten_on == eaten_on)
            .order_by(models.FoodEntry.position.asc().nulls_first(), models.FoodEntry.created_at.desc(), models.FoodEntry.id.desc())
        )
    )
    totals = schemas.NutritionTotals(
        calories=sum(item.calories for item in entries),
        protein=sum(item.protein for item in entries),
        carbohydrates=sum(item.carbohydrates for item in entries),
        fiber=sum(item.fiber for item in entries),
        sugars=sum(item.sugars for item in entries),
        fat=sum(item.fat for item in entries),
        saturated_fat=sum(item.saturated_fat for item in entries),
        sodium=sum(item.sodium for item in entries),
    )
    bodyweight = db.get(models.BodyWeightLog, eaten_on)
    return schemas.DailyLog(
        date=eaten_on,
        entries=entries,
        totals=totals,
        bodyweight=bodyweight.weight if bodyweight else None,
    )


@app.post(
    "/entries",
    response_model=schemas.FoodEntryRead,
    status_code=status.HTTP_201_CREATED,
)
def create_entry(
    payload: schemas.FoodEntryCreate, db: Session = Depends(get_db)
) -> models.FoodEntry:
    entry = models.FoodEntry(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.put("/entries/order", status_code=status.HTTP_204_NO_CONTENT)
def reorder_entries(payload: schemas.FoodEntryOrder, db: Session = Depends(get_db)) -> Response:
    entries = list(db.scalars(select(models.FoodEntry).where(
        models.FoodEntry.eaten_on == payload.eaten_on
    ).order_by(models.FoodEntry.id).with_for_update()))
    by_id = {entry.id: entry for entry in entries}
    if set(payload.entry_ids) != set(by_id):
        raise HTTPException(status_code=409, detail="This day's entries changed. Refresh the log and try again.")
    for position, entry_id in enumerate(payload.entry_ids):
        by_id[entry_id].position = position
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.put("/entries/{entry_id}", response_model=schemas.FoodEntryRead)
def update_entry(
    entry_id: int,
    payload: schemas.FoodEntryUpdate,
    db: Session = Depends(get_db),
) -> models.FoodEntry:
    entry = db.get(models.FoodEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.eaten_on != payload.eaten_on:
        entry.position = None
    for field, value in payload.model_dump().items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, db: Session = Depends(get_db)) -> Response:
    entry = db.get(models.FoodEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/foods", response_model=list[schemas.SavedFoodRead])
def list_foods(db: Session = Depends(get_db)) -> list[models.SavedFood]:
    return list(db.scalars(select(models.SavedFood).order_by(models.SavedFood.name)))


@app.post(
    "/foods",
    response_model=schemas.SavedFoodRead,
    status_code=status.HTTP_201_CREATED,
)
def create_food(
    payload: schemas.SavedFoodCreate, db: Session = Depends(get_db)
) -> models.SavedFood:
    food = models.SavedFood(**payload.model_dump())
    db.add(food)
    db.commit()
    db.refresh(food)
    return food


@app.put("/foods/{food_id}", response_model=schemas.SavedFoodRead)
def update_food(
    food_id: int,
    payload: schemas.SavedFoodCreate,
    db: Session = Depends(get_db),
) -> models.SavedFood:
    food = db.get(models.SavedFood, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="Food not found")
    for field, value in payload.model_dump().items():
        setattr(food, field, value)
    db.commit()
    db.refresh(food)
    return food


@app.delete("/foods/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food(food_id: int, db: Session = Depends(get_db)) -> Response:
    food = db.get(models.SavedFood, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="Food not found")
    db.delete(food)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def entry_from_food(
    food: models.SavedFood,
    eaten_on: date,
    quantity: float,
    name: str | None = None,
) -> models.FoodEntry:
    nutrients = {
        field: getattr(food, field) * quantity for field in NUTRIENT_FIELDS
    }
    serving = food.serving or "1 serving"
    return models.FoodEntry(
        name=name or food.name,
        serving=serving,
        quantity=quantity,
        eaten_on=eaten_on,
        **nutrients,
    )


@app.post("/foods/{food_id}/log", response_model=schemas.FoodEntryRead)
def log_saved_food(
    food_id: int,
    payload: schemas.AddToLogRequest,
    db: Session = Depends(get_db),
) -> models.FoodEntry:
    food = db.get(models.SavedFood, food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="Food not found")
    entry = entry_from_food(food, payload.eaten_on, payload.quantity)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def meal_to_read(meal: models.Meal) -> schemas.MealRead:
    return schemas.MealRead(
        id=meal.id,
        name=meal.name,
        created_at=meal.created_at,
        items=meal.items,
        calories=sum(item.food.calories * item.quantity for item in meal.items),
        protein=sum(item.food.protein * item.quantity for item in meal.items),
    )


@app.get("/meals", response_model=list[schemas.MealRead])
def list_meals(db: Session = Depends(get_db)) -> list[schemas.MealRead]:
    meals = db.scalars(select(models.Meal).order_by(models.Meal.name)).unique()
    return [meal_to_read(meal) for meal in meals]


@app.post(
    "/meals",
    response_model=schemas.MealRead,
    status_code=status.HTTP_201_CREATED,
)
def create_meal(
    payload: schemas.MealCreate, db: Session = Depends(get_db)
) -> schemas.MealRead:
    food_ids = {item.food_id for item in payload.items}
    foods = {
        food.id: food
        for food in db.scalars(
            select(models.SavedFood).where(models.SavedFood.id.in_(food_ids))
        )
    }
    missing = food_ids - foods.keys()
    if missing:
        raise HTTPException(status_code=400, detail="One or more foods do not exist")
    meal = models.Meal(
        name=payload.name,
        items=[
            models.MealItem(food=foods[item.food_id], quantity=item.quantity)
            for item in payload.items
        ],
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal_to_read(meal)


@app.put("/meals/{meal_id}", response_model=schemas.MealRead)
def update_meal(
    meal_id: int,
    payload: schemas.MealCreate,
    db: Session = Depends(get_db),
) -> schemas.MealRead:
    meal = db.get(models.Meal, meal_id)
    if meal is None:
        raise HTTPException(status_code=404, detail="Meal not found")
    food_ids = {item.food_id for item in payload.items}
    foods = {
        food.id: food
        for food in db.scalars(
            select(models.SavedFood).where(models.SavedFood.id.in_(food_ids))
        )
    }
    if food_ids - foods.keys():
        raise HTTPException(status_code=400, detail="One or more foods do not exist")
    meal.name = payload.name
    meal.items = [
        models.MealItem(food=foods[item.food_id], quantity=item.quantity)
        for item in payload.items
    ]
    db.commit()
    db.refresh(meal)
    return meal_to_read(meal)


@app.delete("/meals/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal(meal_id: int, db: Session = Depends(get_db)) -> Response:
    meal = db.get(models.Meal, meal_id)
    if meal is None:
        raise HTTPException(status_code=404, detail="Meal not found")
    db.delete(meal)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/meals/{meal_id}/log", response_model=list[schemas.FoodEntryRead])
def log_meal(
    meal_id: int,
    payload: schemas.AddToLogRequest,
    db: Session = Depends(get_db),
) -> list[models.FoodEntry]:
    meal = db.get(models.Meal, meal_id)
    if meal is None:
        raise HTTPException(status_code=404, detail="Meal not found")
    entries = [
        entry_from_food(
            item.food,
            payload.eaten_on,
            item.quantity * payload.quantity,
            name=f"{meal.name} · {item.food.name}",
        )
        for item in meal.items
    ]
    db.add_all(entries)
    db.commit()
    for entry in entries:
        db.refresh(entry)
    return entries


@app.get("/exercise-tensions", response_model=list[schemas.ExerciseTensionRead])
def list_exercise_tensions(db: Session = Depends(get_db)):
    return db.scalars(select(models.ExerciseTension).order_by(models.ExerciseTension.exercise)).all()


@app.put("/exercise-tensions", response_model=schemas.ExerciseTensionWrite)
def save_exercise_tension(payload: schemas.ExerciseTensionWrite, db: Session = Depends(get_db)):
    profile = db.get(models.ExerciseTension, payload.exercise)
    if profile is None:
        profile = models.ExerciseTension(exercise=payload.exercise)
        db.add(profile)
    profile.allocations = [item.model_dump() for item in payload.allocations]
    db.commit()
    db.refresh(profile)
    return profile
