"use client";

import { FormEvent, useState } from "react";

type Props = {
  value: number | null;
  busy: boolean;
  onSave: (weight: number) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function BodyweightControl({ value, busy, onSave, onDelete }: Props) {
  const [input, setInput] = useState(value?.toString() ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const weight = Number(input);
    if (weight > 0) await onSave(weight);
  }

  return (
    <form className="bodyweight-control" onSubmit={submit}>
      <label>
        <span>Bodyweight</span>
        <input
          type="number"
          inputMode="decimal"
          min="1"
          step=".1"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="—"
          aria-label="Bodyweight in pounds"
        />
        <b>lb</b>
      </label>
      <button type="submit" disabled={busy || !input}>
        {busy ? "..." : "Save"}
      </button>
      {value !== null && (
        <button
          className="clear-weight"
          type="button"
          disabled={busy}
          onClick={async () => {
            setInput("");
            await onDelete();
          }}
          aria-label="Clear bodyweight"
        >
          ×
        </button>
      )}
    </form>
  );
}
