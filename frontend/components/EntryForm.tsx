"use client";

import { FormEvent, useId, useState } from "react";
import { EntryPayload, FoodEntry } from "@/lib/types";
import { compatibleUnits, formatServingNumber, parseServingSize, servingAmount, servingQuantity, ServingUnit } from "@/lib/serving";
import { ServingNumberInput } from "@/components/ServingNumberInput";

type Props = {
  date: string;
  entry?: FoodEntry | null;
  busy: boolean;
  onCancel?: () => void;
  onOpenLibrary: () => void;
  onSave: (payload: EntryPayload) => Promise<void>;
};

const optionalFields: Array<{
  key: keyof EntryPayload;
  label: string;
  unit: string;
}> = [
  { key: "carbohydrates", label: "Total carbs", unit: "g" },
  { key: "fiber", label: "Dietary fiber", unit: "g" },
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

const nutrientKeys = [
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
] as const;

function blankEntry(date: string): EntryPayload {
  return {
    name: "",
    serving: "",
    quantity: 1,
    eaten_on: date,
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

export function EntryForm({
  date,
  entry,
  busy,
  onCancel,
  onOpenLibrary,
  onSave,
}: Props) {
  const [form, setForm] = useState<EntryPayload>(() =>
    entry ? { ...entry } : blankEntry(date),
  );
  const [detailsOpen, setDetailsOpen] = useState(Boolean(entry));
  const [quantityInput, setQuantityInput] = useState(
    String(entry?.quantity ?? 1),
  );
  const [amountInput, setAmountInput] = useState<string | null>(null);
  const [amountUnit, setAmountUnit] = useState<ServingUnit>(
    () => parseServingSize(entry?.serving ?? null)?.unit ?? "g",
  );
  const fieldId = useId();
  const servingSize = parseServingSize(form.serving);
  const availableUnits = servingSize ? compatibleUnits(servingSize.unit) : [];
  const displayUnit = servingSize && !availableUnits.includes(amountUnit) ? servingSize.unit : amountUnit;
  const amountValue = amountInput ?? (servingSize
    ? formatServingNumber(servingAmount(servingSize, form.quantity, displayUnit)) : "");

  const setText = (key: "name" | "serving", value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setNumber = (key: keyof EntryPayload, value: string) =>
    setForm((current) => ({
      ...current,
      [key]: value === "" ? 0 : Number(value),
    }));

  const scaleQuantity = (quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setForm((current) => {
      const ratio = quantity / current.quantity;
      const scaled = { ...current, quantity };
      for (const key of nutrientKeys) {
        scaled[key] = Number((Number(current[key]) * ratio).toPrecision(15));
      }
      return scaled;
    });
  };

  const setQuantity = (value: string) => {
    setQuantityInput(value);
    setAmountInput(null);
    scaleQuantity(Number(value));
  };

  const setAmount = (value: string) => {
    setAmountInput(value);
    const amount = Number(value);
    if (!servingSize || !Number.isFinite(amount) || amount <= 0) return;
    const quantity = servingQuantity(servingSize, amount, displayUnit);
    setQuantityInput(formatServingNumber(quantity));
    scaleQuantity(quantity);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave({
      ...form,
      name: form.name.trim() || "Untitled food",
      serving: form.serving?.trim() || null,
      eaten_on: date,
    });
    if (!entry) {
      setForm(blankEntry(date));
      setQuantityInput("1");
      setAmountInput(null);
      setAmountUnit("g");
    }
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <div className="panel-heading">
        <h2>{entry ? "Edit entry" : "Add food"}</h2>
      </div>

      {!entry && (
        <button className="entry-library-button" type="button" onClick={onOpenLibrary}>
          Browse saved foods &amp; meals
          <b>→</b>
        </button>
      )}

      <label className="field">
        <span>Food / meal</span>
        <input
          value={form.name}
          onChange={(event) => setText("name", event.target.value)}
          placeholder="Optional label"
          maxLength={160}
        />
      </label>

      <div className="required-grid">
        <label className="field">
          <span>Calories *</span>
          <div className="input-unit">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.calories}
              onChange={(event) => setNumber("calories", event.target.value)}
              placeholder="0"
              required
            />
            <b>kcal</b>
          </div>
        </label>
        <label className="field">
          <span>Protein *</span>
          <div className="input-unit">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form.protein}
              onChange={(event) => setNumber("protein", event.target.value)}
              placeholder="0"
              required
            />
            <b>g</b>
          </div>
        </label>
      </div>

      <label className="field compact-field">
        <span>Size of one serving</span>
        <input
          value={form.serving ?? ""}
          onChange={(event) => {
            setText("serving", event.target.value);
            setAmountInput(null);
            const size = parseServingSize(event.target.value);
            if (size) setAmountUnit(size.unit);
          }}
          placeholder="e.g. 100 g or 4 oz"
          maxLength={80}
        />
      </label>
      <div className="serving-grid">
        {servingSize ? (
          <div className="field compact-field">
            <label htmlFor={`${fieldId}-amount`}>Amount eaten</label>
            <div className="serving-amount">
              <ServingNumberInput
                id={`${fieldId}-amount`}
                label="amount eaten"
                value={amountValue}
                onChange={setAmount}
              />
              <select
                aria-label="Amount unit"
                value={displayUnit}
                onChange={(event) => {
                  setAmountUnit(event.target.value as ServingUnit);
                  setAmountInput(null);
                }}
              >
                {availableUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <p className="serving-hint">Enter a measured serving size above to edit the amount eaten.</p>
        )}
        <div className="field compact-field">
          <label htmlFor={`${fieldId}-quantity`}>Quantity</label>
          <ServingNumberInput
            id={`${fieldId}-quantity`}
            label="quantity"
            value={quantityInput}
            onChange={setQuantity}
          />
        </div>
      </div>

      <button
        className="details-toggle"
        type="button"
        onClick={() => setDetailsOpen((value) => !value)}
        aria-expanded={detailsOpen}
      >
        <span>{detailsOpen ? "−" : "+"} Nutrition details</span>
        <span>{detailsOpen ? "Hide" : "Optional"}</span>
      </button>

      {detailsOpen && (
        <div className="details-grid">
          {optionalFields.map(({ key, label, unit }) => (
            <label className="mini-field" key={key}>
              <span>{label}</span>
              <div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={Number(form[key]) || ""}
                  onChange={(event) => setNumber(key, event.target.value)}
                  placeholder="0"
                />
                <b>{unit}</b>
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="form-actions">
        {entry && (
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Saving..." : entry ? "Update entry" : "Add to log →"}
        </button>
      </div>
    </form>
  );
}
