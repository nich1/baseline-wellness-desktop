const units = {
  g: { family: "mass", factor: 1, aliases: ["g", "gram", "grams"] },
  kg: { family: "mass", factor: 1000, aliases: ["kg", "kilogram", "kilograms"] },
  mg: { family: "mass", factor: 0.001, aliases: ["mg", "milligram", "milligrams"] },
  oz: { family: "mass", factor: 28.349523125, aliases: ["oz", "ounce", "ounces"] },
  lb: { family: "mass", factor: 453.59237, aliases: ["lb", "lbs", "pound", "pounds"] },
  ml: { family: "volume", factor: 1, aliases: ["ml", "milliliter", "milliliters"] },
  l: { family: "volume", factor: 1000, aliases: ["l", "liter", "liters"] },
  "fl oz": { family: "volume", factor: 29.5735295625, aliases: ["fl oz", "fluid ounce", "fluid ounces"] },
  cup: { family: "volume", factor: 236.5882365, aliases: ["cup", "cups"] },
  tbsp: { family: "volume", factor: 14.78676478125, aliases: ["tbsp", "tablespoon", "tablespoons"] },
  tsp: { family: "volume", factor: 4.92892159375, aliases: ["tsp", "teaspoon", "teaspoons"] },
} as const;

export type ServingUnit = keyof typeof units;
export type ServingSize = { amount: number; unit: ServingUnit };

function parseMeasurement(value: string): ServingSize | null {
  const match = value.trim().match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*([a-z ]+)$/i);
  if (!match) return null;
  const parts = match[1].split(/[\s/]+/).map(Number);
  const amount = parts.length === 3 ? parts[0] + parts[1] / parts[2]
    : parts.length === 2 ? parts[0] / parts[1] : parts[0];
  const unit = (Object.keys(units) as ServingUnit[]).find((key) =>
    (units[key].aliases as readonly string[]).includes(match[2].trim().toLowerCase()),
  );
  return unit && Number.isFinite(amount) && amount > 0 ? { amount, unit } : null;
}

export function parseServingSize(serving: string | null): ServingSize | null {
  if (!serving) return null;
  // Nutrition labels often provide a usable weight in “1 patty (112 g)”.
  for (const match of serving.matchAll(/\(([^)]+)\)/g)) {
    const measurement = parseMeasurement(match[1]);
    if (measurement) return measurement;
  }
  return parseMeasurement(serving);
}

export function compatibleUnits(unit: ServingUnit): ServingUnit[] {
  return (Object.keys(units) as ServingUnit[]).filter((key) => units[key].family === units[unit].family);
}

export function servingAmount(size: ServingSize, quantity: number, unit: ServingUnit): number {
  return size.amount * quantity * units[size.unit].factor / units[unit].factor;
}

export function servingQuantity(size: ServingSize, amount: number, unit: ServingUnit): number {
  return amount / servingAmount(size, 1, unit);
}

export function formatServingNumber(value: number): string {
  return String(Number(value.toPrecision(12)));
}
