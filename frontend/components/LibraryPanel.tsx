"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { appToday } from "@/lib/dates";
import { Meal, SavedFood, SavedFoodPayload } from "@/lib/types";

type Props = {
  date: string;
  onClose: () => void;
  onLogChanged: () => Promise<void>;
};

const nutrientFields: Array<{
  key: keyof SavedFoodPayload;
  label: string;
  unit: string;
}> = [
  { key: "carbohydrates", label: "Total carbs", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugars", label: "Total sugars", unit: "g" },
  { key: "added_sugars", label: "Added sugars", unit: "g" },
  { key: "sugar_alcohols", label: "Sugar alcohols", unit: "g" },
  { key: "fat", label: "Total fat", unit: "g" },
  { key: "saturated_fat", label: "Saturated fat", unit: "g" },
  { key: "trans_fat", label: "Trans fat", unit: "g" },
  { key: "monounsaturated_fat", label: "Monounsaturated", unit: "g" },
  { key: "polyunsaturated_fat", label: "Polyunsaturated", unit: "g" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
];

function blankFood(): SavedFoodPayload {
  return {
    name: "",
    serving: "",
    calories: 0,
    protein: 0,
    carbohydrates: 0,
    fiber: 0,
    sugars: 0,
    added_sugars: 0,
    sugar_alcohols: 0,
    fat: 0,
    saturated_fat: 0,
    trans_fat: 0,
    monounsaturated_fat: 0,
    polyunsaturated_fat: 0,
    cholesterol: 0,
    sodium: 0,
    potassium: 0,
  };
}

function number(value: number) {
  return Number.isInteger(value) ? value : Number(value.toFixed(1));
}

const primaryNutrients = [
  { key: "calories", label: "KCAL", unit: "" },
  { key: "protein", label: "PROTEIN", unit: "g" },
  { key: "carbohydrates", label: "CARBS", unit: "g" },
  { key: "fat", label: "FAT", unit: "g" },
] as const;

const secondaryNutrients = [
  { key: "fiber", label: "Fiber" },
  { key: "saturated_fat", label: "Saturated fat" },
  { key: "sugars", label: "Sugars" },
  { key: "added_sugars", label: "Added sugars" },
] as const;

type LibraryNutrients = Pick<SavedFood, (typeof primaryNutrients)[number]["key"] | (typeof secondaryNutrients)[number]["key"]>;

function servingQuantity(value: string): number | null {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function LibraryQuantity({ name, value, disabled, onChange }: {
  name: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const quantity = servingQuantity(value);
  return (
    <div className="library-quantity">
      <span>Servings</span>
      <div>
        <button type="button" aria-label={`Decrease servings for ${name}`} disabled={disabled || quantity === null || quantity <= 1} onClick={() => onChange(String(quantity! - 1))}>−</button>
        <input
          type="number"
          min="0"
          step="any"
          required
          aria-label={`Servings for ${name}`}
          aria-invalid={quantity === null}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" aria-label={`Increase servings for ${name}`} disabled={disabled} onClick={() => onChange(String((quantity ?? 0) + 1))}>+</button>
      </div>
    </div>
  );
}

function LibraryNutrition({ nutrients, quantity }: { nutrients: LibraryNutrients; quantity: number | null }) {
  const amount = (key: keyof LibraryNutrients) => quantity === null ? "—" : number(nutrients[key] * quantity);
  return (
    <div className="library-nutrition">
      <div className="library-macros">
        {primaryNutrients.map(({ key, label, unit }) => (
          <strong key={key}>{amount(key)}{quantity === null ? "" : unit}<small>{label}</small></strong>
        ))}
      </div>
      <div className="library-nutrient-details">
        {secondaryNutrients.map(({ key, label }) => (
          <span key={key}>{label} <b>{amount(key)}{quantity === null ? "" : "g"}</b></span>
        ))}
      </div>
    </div>
  );
}

function mealNutrition(meal: Meal): LibraryNutrients {
  const total = (key: (typeof secondaryNutrients)[number]["key"] | "carbohydrates" | "fat") =>
    meal.items.reduce((sum, item) => sum + item.food[key] * item.quantity, 0);
  return {
    calories: meal.calories,
    protein: meal.protein,
    carbohydrates: total("carbohydrates"),
    fat: total("fat"),
    fiber: total("fiber"),
    saturated_fat: total("saturated_fat"),
    sugars: total("sugars"),
    added_sugars: total("added_sugars"),
  };
}

export function LibraryPanel({ date, onClose, onLogChanged }: Props) {
  const [tab, setTab] = useState<"foods" | "meals">("foods");
  const [foods, setFoods] = useState<SavedFood[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [foodForm, setFoodForm] = useState<SavedFoodPayload>(blankFood);
  const [editingFood, setEditingFood] = useState<number | null>(null);
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [mealName, setMealName] = useState("");
  const [mealItems, setMealItems] = useState<Record<number, number>>({});
  const [editingMeal, setEditingMeal] = useState<number | null>(null);
  const [showMealForm, setShowMealForm] = useState(false);
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const quantityInput = (key: string) => quantities[key] ?? "1";
  const setQuantity = (key: string, value: string) => setQuantities((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let active = true;
    Promise.all([api.getFoods(), api.getMeals()])
      .then(([foodData, mealData]) => {
        if (active) {
          setFoods(foodData);
          setMeals(mealData);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load library");
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleFoods = useMemo(
    () => foods.filter((food) => food.name.toLowerCase().includes(search.toLowerCase())),
    [foods, search],
  );
  const visibleMeals = useMemo(
    () => meals.filter((meal) => meal.name.toLowerCase().includes(search.toLowerCase())),
    [meals, search],
  );

  function editFood(food: SavedFood) {
    const { id: _id, created_at: _createdAt, ...payload } = food;
    void _id;
    void _createdAt;
    setFoodForm(payload);
    setEditingFood(food.id);
    setShowFoodForm(true);
  }

  function resetFoodForm() {
    setFoodForm(blankFood());
    setEditingFood(null);
    setShowFoodForm(false);
  }

  async function refreshLibrary() {
    const [foodData, mealData] = await Promise.all([api.getFoods(), api.getMeals()]);
    setFoods(foodData);
    setMeals(mealData);
  }

  async function saveFood(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...foodForm,
        name: foodForm.name.trim(),
        serving: foodForm.serving?.trim() || null,
      };
      if (editingFood) await api.updateFood(editingFood, payload);
      else await api.createFood(payload);
      await refreshLibrary();
      resetFoodForm();
      setMessage(editingFood ? "Food updated." : "Food saved to library.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save food");
    } finally {
      setBusy(false);
    }
  }

  async function removeFood(food: SavedFood) {
    if (!window.confirm(`Delete “${food.name}” from your library?`)) return;
    setBusy(true);
    try {
      await api.deleteFood(food.id);
      await refreshLibrary();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete food");
    } finally {
      setBusy(false);
    }
  }

  async function addFood(food: SavedFood) {
    const quantity = servingQuantity(quantityInput(`food-${food.id}`));
    if (quantity === null) return;
    setBusy(true);
    setError("");
    try {
      await api.logFood(food.id, date, quantity);
      await onLogChanged();
      setMessage(`${quantity} serving${quantity === 1 ? "" : "s"} of ${food.name} added to the log.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add food");
    } finally {
      setBusy(false);
    }
  }

  function editMeal(meal: Meal) {
    setMealName(meal.name);
    const items: Record<number, number> = {};
    for (const item of meal.items) {
      items[item.food.id] = (items[item.food.id] ?? 0) + item.quantity;
    }
    setMealItems(items);
    setEditingMeal(meal.id);
    setShowMealForm(true);
  }

  function resetMealForm() {
    setMealName("");
    setMealItems({});
    setEditingMeal(null);
    setShowMealForm(false);
  }

  function toggleMealFood(foodId: number) {
    setMealItems((current) => {
      const next = { ...current };
      if (next[foodId]) delete next[foodId];
      else next[foodId] = 1;
      return next;
    });
  }

  async function saveMeal(event: FormEvent) {
    event.preventDefault();
    const items = Object.entries(mealItems).map(([foodId, quantity]) => ({
      food_id: Number(foodId),
      quantity,
    }));
    if (!items.length) {
      setError("Choose at least one food for the meal.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = { name: mealName.trim(), items };
      if (editingMeal !== null) await api.updateMeal(editingMeal, payload);
      else await api.createMeal(payload);
      await refreshLibrary();
      resetMealForm();
      setMessage(editingMeal !== null ? "Meal updated." : "Meal saved to library.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save meal");
    } finally {
      setBusy(false);
    }
  }

  async function addMeal(meal: Meal) {
    const quantity = servingQuantity(quantityInput(`meal-${meal.id}`));
    if (quantity === null) return;
    setBusy(true);
    setError("");
    try {
      await api.logMeal(meal.id, date, quantity);
      await onLogChanged();
      setMessage(`${quantity} serving${quantity === 1 ? "" : "s"} of ${meal.name} added as ${meal.items.length} entries.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add meal");
    } finally {
      setBusy(false);
    }
  }

  async function removeMeal(meal: Meal) {
    if (!window.confirm(`Delete meal “${meal.name}”?`)) return;
    setBusy(true);
    try {
      await api.deleteMeal(meal.id);
      await refreshLibrary();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete meal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="library-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="library-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Food and meal library"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="library-header">
          <div>
            <div>
              <h2>Food and meal library</h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close library">×</button>
        </header>

        <div className="library-tools">
          <div className="library-tabs">
            <button className={tab === "foods" ? "active" : ""} onClick={() => setTab("foods")}>
              Foods <span>{foods.length}</span>
            </button>
            <button className={tab === "meals" ? "active" : ""} onClick={() => setTab("meals")}>
              Meals <span>{meals.length}</span>
            </button>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${tab}...`}
          />
          <button
            className="button primary library-new"
            disabled={busy}
            onClick={() => {
              if (tab === "foods") setShowFoodForm(true);
              else {
                resetMealForm();
                setShowMealForm(true);
              }
            }}
          >
            + New {tab === "foods" ? "food" : "meal"}
          </button>
        </div>

        {(error || message) && (
          <div className={`library-message ${error ? "is-error" : ""}`}>
            {error || message}
            <button onClick={() => { setError(""); setMessage(""); }}>×</button>
          </div>
        )}

        <div className="library-body">
          {tab === "foods" && showFoodForm && (
            <form className="library-form" onSubmit={saveFood}>
              <div className="library-form-title">
                <h3>{editingFood ? "Edit food" : "Create food"}</h3>
                <button type="button" onClick={resetFoodForm}>Cancel</button>
              </div>
              <div className="library-form-grid">
                <label className="field wide">
                  <span>Food name *</span>
                  <input
                    required
                    value={foodForm.name}
                    onChange={(event) => setFoodForm({ ...foodForm, name: event.target.value })}
                    placeholder="Greek yogurt"
                  />
                </label>
                <label className="field">
                  <span>Serving</span>
                  <input
                    value={foodForm.serving ?? ""}
                    onChange={(event) => setFoodForm({ ...foodForm, serving: event.target.value })}
                    placeholder="170g"
                  />
                </label>
                {(["calories", "protein"] as const).map((key) => (
                  <label className="field" key={key}>
                    <span>{key} *</span>
                    <div className="input-unit">
                      <input
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={foodForm[key]}
                        onChange={(event) => setFoodForm({
                          ...foodForm,
                          [key]: Number(event.target.value),
                        })}
                      />
                      <b>{key === "calories" ? "kcal" : "g"}</b>
                    </div>
                  </label>
                ))}
                {nutrientFields.map(({ key, label, unit }) => (
                  <label className="field" key={key}>
                    <span>{label}</span>
                    <div className="input-unit">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={Number(foodForm[key]) || ""}
                        onChange={(event) => setFoodForm({
                          ...foodForm,
                          [key]: Number(event.target.value),
                        })}
                      />
                      <b>{unit}</b>
                    </div>
                  </label>
                ))}
              </div>
              <button className="button primary save-library-item" disabled={busy}>
                {busy ? "Saving..." : editingFood ? "Update food" : "Save food"}
              </button>
            </form>
          )}

          {tab === "meals" && showMealForm && (
            <form className="library-form" onSubmit={saveMeal}>
              <div className="library-form-title">
                <h3>{editingMeal !== null ? "Edit meal" : "Create meal"}</h3>
                <button type="button" disabled={busy} onClick={resetMealForm}>Cancel</button>
              </div>
              <label className="field">
                <span>Meal name *</span>
                <input
                  required
                  value={mealName}
                  onChange={(event) => setMealName(event.target.value)}
                  placeholder="Weekday breakfast"
                />
              </label>
              <p className="meal-instruction">Select foods and set servings per meal.</p>
              <div className="meal-picker">
                {foods.map((food) => (
                  <div className={mealItems[food.id] ? "selected" : ""} key={food.id}>
                    <button type="button" onClick={() => toggleMealFood(food.id)}>
                      <i>{mealItems[food.id] ? "✓" : "+"}</i>
                      <span><strong>{food.name}</strong><small>{food.calories} kcal · {food.protein}g P</small></span>
                    </button>
                    {mealItems[food.id] && (
                      <label>
                        <input
                          type="number"
                          min=".1"
                          step=".1"
                          value={mealItems[food.id]}
                          onChange={(event) => setMealItems({
                            ...mealItems,
                            [food.id]: Number(event.target.value),
                          })}
                        />
                        <span>servings</span>
                      </label>
                    )}
                  </div>
                ))}
                {!foods.length && <p>Create a food before building a meal.</p>}
              </div>
              <button className="button primary save-library-item" disabled={busy || !foods.length}>
                {busy ? "Saving..." : editingMeal !== null ? "Update meal" : "Save meal"}
              </button>
            </form>
          )}

          {tab === "foods" && !showFoodForm && (
            <div className="library-list">
              {visibleFoods.map((food) => (
                <article className="library-row" key={food.id}>
                  <div>
                    <h3>{food.name}</h3>
                    <p>{food.serving || "1 serving"}</p>
                  </div>
                  <LibraryNutrition nutrients={food} quantity={servingQuantity(quantityInput(`food-${food.id}`))} />
                  <div className="library-row-actions">
                    <LibraryQuantity name={food.name} value={quantityInput(`food-${food.id}`)} disabled={busy} onChange={(value) => setQuantity(`food-${food.id}`, value)} />
                    <button className="add-record" disabled={busy || servingQuantity(quantityInput(`food-${food.id}`)) === null} onClick={() => addFood(food)}>
                      + Add to {date === appToday() ? "today" : "day"}
                    </button>
                    <button onClick={() => editFood(food)}>Edit</button>
                    <button onClick={() => removeFood(food)}>Delete</button>
                  </div>
                </article>
              ))}
              {!visibleFoods.length && <div className="library-empty">No saved foods found.</div>}
            </div>
          )}

          {tab === "meals" && !showMealForm && (
            <div className="library-list">
              {visibleMeals.map((meal) => (
                <article className="library-row meal-row" key={meal.id}>
                  <div>
                    <h3>{meal.name}</h3>
                    <p>{meal.items.map((item) => `${number(item.quantity)}× ${item.food.name}`).join(" · ")}</p>
                  </div>
                  <LibraryNutrition nutrients={mealNutrition(meal)} quantity={servingQuantity(quantityInput(`meal-${meal.id}`))} />
                  <div className="library-row-actions">
                    <LibraryQuantity name={meal.name} value={quantityInput(`meal-${meal.id}`)} disabled={busy} onChange={(value) => setQuantity(`meal-${meal.id}`, value)} />
                    <button className="add-record" disabled={busy || servingQuantity(quantityInput(`meal-${meal.id}`)) === null} onClick={() => addMeal(meal)}>
                      + Add meal
                    </button>
                    <button disabled={busy} onClick={() => editMeal(meal)}>Edit</button>
                    <button onClick={() => removeMeal(meal)}>Delete</button>
                  </div>
                </article>
              ))}
              {!visibleMeals.length && <div className="library-empty">No saved meals found.</div>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
