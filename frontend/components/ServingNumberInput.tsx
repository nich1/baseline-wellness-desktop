"use client";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

// Native step=1 also rejects typed decimals. Keep validation independent of
// the buttons and arrow keys, which always change the value by one.
export function ServingNumberInput({ id, label, value, onChange }: Props) {
  const number = Number(value);
  const step = (direction: number) => {
    const next = Number(((Number.isFinite(number) ? number : 0) + direction).toPrecision(12));
    if (next > 0) onChange(String(next));
  };

  return (
    <div className="serving-number">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        required
        value={value}
        ref={(input) => {
          input?.setCustomValidity(value !== "" && (!Number.isFinite(number) || number <= 0)
            ? "Enter an amount greater than zero." : "");
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            step(event.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
      <div className="serving-stepper">
        <button type="button" aria-label={`Increase ${label} by 1`} onClick={() => step(1)}>▴</button>
        <button type="button" aria-label={`Decrease ${label} by 1`} disabled={number <= 1 || !Number.isFinite(number)} onClick={() => step(-1)}>▾</button>
      </div>
    </div>
  );
}
