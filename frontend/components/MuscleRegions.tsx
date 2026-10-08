"use client";

import { useState } from "react";
import { resolveRegions, regionsComplete } from "@/lib/tension";
import { TensionAllocation } from "@/lib/types";

export function MuscleRegions({ row, label, disabled, onChange }: {
  row: TensionAllocation; label: string; disabled: boolean;
  onChange: (heads: Record<string, number>) => void;
}) {
  const [empty, setEmpty] = useState<string | null>(null);
  const heads = row.heads ?? {};
  const regions = resolveRegions(row.muscle, heads);
  if (!regions.length) return null;
  const complete = regionsComplete(row.muscle, heads);
  return <details className="muscle-regions">
    <summary>Refine {label.toLowerCase()} distribution <span>Heads & regions</span></summary>
    <p>Percentages within {label.toLowerCase()}. Auto regions share whatever remains.</p>
    <div className="region-grid">
      {regions.map((region) => {
        const maximum = 100 - Object.entries(heads).reduce((sum, [key, value]) => sum + (key === region.id ? 0 : value), 0);
        return <div className="region-card" key={region.id}>
          <label>
            <span>{region.label}</span>
            <span className="tension-number"><input
              aria-label={`${label} ${region.label} percent`}
              type="number" min={0} max={maximum} step={1} disabled={disabled}
              value={empty === region.id ? "" : region.percent}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => setEmpty(null)}
              onChange={(event) => {
                const value = event.currentTarget.value;
                const next = { ...heads };
                if (value === "") {
                  delete next[region.id];
                  setEmpty(region.id);
                } else {
                  const percent = Math.max(0, Math.min(maximum, Math.round(Number(value))));
                  if (!Number.isFinite(percent)) return;
                  next[region.id] = percent;
                  event.currentTarget.value = String(percent);
                  setEmpty(null);
                }
                onChange(next);
              }}
            /><span>%</span></span>
          </label>
          <div className="region-status">
            <span>{region.automatic ? "Auto" : "Custom"}</span>
            {!region.automatic && <button disabled={disabled} aria-label={`Reset ${label} ${region.label} to auto`} onClick={() => {
              const next = { ...heads }; delete next[region.id]; setEmpty(null); onChange(next);
            }}>Use auto</button>}
          </div>
          <small>{Number((row.percent * region.percent / 100).toFixed(2))}% of exercise tension</small>
        </div>;
      })}
    </div>
    {!complete && <p role="status" className="region-warning">Region percentages must total 100%. Adjust a value or set a region back to Auto.</p>}
  </details>;
}
