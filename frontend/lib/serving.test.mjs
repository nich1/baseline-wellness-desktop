import assert from "node:assert/strict";
import test from "node:test";
import { compatibleUnits, parseServingSize, servingAmount, servingQuantity } from "./serving.ts";

test("uses the labeled gram weight for existing beef and composite servings", () => {
  const beef = parseServingSize("4 oz (112 g), raw");
  assert.deepEqual(beef, { amount: 112, unit: "g" });
  assert.equal(servingQuantity(beef, 180, "g"), 180 / 112);
  assert.equal(servingAmount(beef, 1.5, "g"), 168);
  assert.deepEqual(parseServingSize("1 scoop (31 g)"), { amount: 31, unit: "g" });
  assert.deepEqual(parseServingSize("1 cup (240 mL)"), { amount: 240, unit: "ml" });
});

test("accepts decimal and fractional serving sizes, with or without spaces", () => {
  assert.deepEqual(parseServingSize("100g"), { amount: 100, unit: "g" });
  assert.deepEqual(parseServingSize(".5 kg"), { amount: 0.5, unit: "kg" });
  assert.deepEqual(parseServingSize("1/2 cup"), { amount: 0.5, unit: "cup" });
  assert.deepEqual(parseServingSize("1 1/2 ounces"), { amount: 1.5, unit: "oz" });
});

test("converts units while keeping mass and volume separate", () => {
  const serving = parseServingSize("4 oz");
  const quantity = servingQuantity(serving, 180, "g");
  assert.ok(Math.abs(servingAmount(serving, quantity, "g") - 180) < 1e-10);
  assert.equal(servingAmount(parseServingSize("1 kg"), 0.5, "g"), 500);
  assert.equal(servingAmount(parseServingSize("240 ml"), 1.5, "l"), 0.36);
  assert.ok(!compatibleUnits("g").includes("ml"));
  assert.ok(!compatibleUnits("cup").includes("g"));
});

test("does not infer measurements from missing, ambiguous, or invalid units", () => {
  for (const value of [null, "", "112", "1 serving", "0 g", "-100g", "1/0 cup", "a bowl"])
    assert.equal(parseServingSize(value), null);
});
