"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MuscleRegions } from "@/components/MuscleRegions";
import { muscles, regionsComplete } from "@/lib/tension";
import { TensionAllocation } from "@/lib/types";


const muscleInfo = (id: string) => {
  const [key, label, color] = muscles.find(([key]) => key === id)!;
  return [key, label, `var(--muscle-${key}, ${color})`] as const;
};
type Profiles = Record<string, TensionAllocation[]>;

export function TensionEditor({ exercise }: { exercise: string }) {
  const [emptyInput, setEmptyInput] = useState<{ exercise: string; muscle: string } | null>(null);
  const [saved, setSaved] = useState<Profiles>({});
  const [drafts, setDrafts] = useState<Profiles>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    api.getExerciseTensions().then((profiles) => {
      if (active) {
        setSaved(Object.fromEntries(profiles.map((profile) => [profile.exercise, profile.allocations])));
        setLoadError("");
      }
    }).catch(() => {
      if (active) setLoadError("Could not load tension settings. Please retry before editing.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const rows = drafts[exercise] ?? saved[exercise] ?? [];
  const total = rows.reduce((sum, row) => sum + row.percent, 0);
  const remaining = 100 - total;
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved[exercise] ?? []);
  const busy = saving === exercise;
  const complete = total === 100 && rows.every((row) => regionsComplete(row.muscle, row.heads));

  function update(next: TensionAllocation[]) {
    setEmptyInput(null);
    setDrafts((current) => ({ ...current, [exercise]: next }));
    setMessages((current) => ({ ...current, [exercise]: "" }));
    setErrors((current) => ({ ...current, [exercise]: "" }));
  }

  function changePercent(muscle: string, value: string) {
    const row = rows.find((item) => item.muscle === muscle)!;
    const requested = Math.round(Number(value));
    if (!Number.isFinite(requested)) return;
    const maximum = remaining + row.percent;
    const percent = Math.max(0, Math.min(maximum, requested));
    update(rows.map((item) => item.muscle === muscle
      ? { ...item, percent } : item));
    if (requested > maximum) {
      setMessages((current) => ({ ...current, [exercise]: `Limited to ${maximum}%. Lower another muscle to free up more tension.` }));
    }
    return percent;
  }

  function addMuscle(muscle: string) {
    const next = [...rows, { muscle, percent: 0 }];
    const share = Math.floor(100 / next.length);
    const extra = 100 % next.length;
    update(next.map((row, index) => ({ ...row, percent: share + (index < extra ? 1 : 0) })));
    setMessages((current) => ({ ...current, [exercise]: "Split evenly across selected muscles. Adjust any percentage to customize." }));
  }

  async function save() {
    if (!complete) return;
    const name = exercise;
    setSaving(name);
    setErrors((current) => ({ ...current, [name]: "" }));
    try {
      const profile = await api.saveExerciseTension({ exercise: name, allocations: rows });
      setSaved((current) => ({ ...current, [name]: profile.allocations }));
      setDrafts((current) => ({ ...current, [name]: profile.allocations }));
      setMessages((current) => ({ ...current, [name]: "Distribution saved." }));
    } catch {
      setErrors((current) => ({ ...current, [name]: "Could not save this distribution. Your edits are still here; please try again." }));
    } finally { setSaving(null); }
  }

  return (
    <section className="tension-panel" aria-labelledby="tension-title">
      <div className="tension-heading">
        <div>
          <span className="tension-eyebrow">EXERCISE SETUP</span>
          <h2 id="tension-title">Tension distribution</h2>
          <p>Choose where you feel the work in {exercise || "each exercise"}.</p>
        </div>
        {!loading && !loadError && exercise && <div className="tension-total">
          <strong>{total}<small> / 100%</small></strong>
          <span>{remaining ? `${remaining}% left to assign` : "Fully allocated"}</span>
        </div>}
      </div>
      {loading ? <p className="tension-placeholder">Loading tension settings…</p>
        : loadError ? <div className="tension-placeholder" role="alert">{loadError} <button className="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>Retry</button></div>
        : !exercise ? <p className="tension-placeholder">Log an exercise to start setting its muscle distribution.</p>
        : <>
          <div className="tension-bar" role="img" aria-label={`${total}% assigned, ${remaining}% unassigned`}>
            {rows.map((row) => <div key={row.muscle} style={{ width: `${row.percent}%`, background: muscleInfo(row.muscle)[2] }} title={`${muscleInfo(row.muscle)[1]}: ${row.percent}%`} />)}
          </div>
          <div className="tension-rows">
            {!rows.length && <div className="tension-empty"><strong>Every exercise has its own balance.</strong><p>Add a muscle below, then set its share of the work.</p><span>For example: chest 50% · triceps 30% · front delts 20%</span></div>}
            {rows.map((row) => {
              const [, label, color] = muscleInfo(row.muscle);
              return <div className="tension-muscle-block" key={`${exercise}:${row.muscle}`}><div className="tension-row">
                <span className="tension-muscle"><i style={{ background: color }} />{label}</span>
                <input type="range" aria-label={`${label} tension slider`} min={0} max={100} step={1} value={row.percent} disabled={busy} style={{ accentColor: color }} onChange={(event) => changePercent(row.muscle, event.target.value)} />
                <label className="tension-number"><input
                  aria-label={`${label} tension percent`} type="number" min={0} max={remaining + row.percent} step={1}
                  value={emptyInput?.exercise === exercise && emptyInput.muscle === row.muscle ? "" : row.percent}
                  disabled={busy}
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={() => setEmptyInput(null)}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    const percent = changePercent(row.muscle, value);
                    if (value === "") setEmptyInput({ exercise, muscle: row.muscle });
                    else event.currentTarget.value = String(percent ?? row.percent);
                  }}
                /><span>%</span></label>
                <button className="tension-remove" aria-label={`Remove ${label}`} disabled={busy} onClick={() => update(rows.filter((item) => item.muscle !== row.muscle))}>×</button>
              </div>
              <MuscleRegions row={row} label={label} disabled={busy}
                onChange={(heads) => update(rows.map((item) => item.muscle === row.muscle ? { ...item, heads } : item))} />
              </div>;
            })}
          </div>
          <div className="tension-actions">
            <select aria-label="Add muscle group" value="" disabled={busy || rows.length === muscles.length} onChange={(event) => addMuscle(event.target.value)}>
              <option value="" disabled>+ Add muscle group</option>
              {muscles.filter(([key]) => !rows.some((row) => row.muscle === key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <div>
              {dirty && <button className="button" disabled={busy} onClick={() => update(saved[exercise] ?? [])}>Discard edits</button>}
              <button className="button primary" disabled={!dirty || !complete || saving !== null} onClick={save}>{busy ? "Saving…" : "Save distribution"}</button>
            </div>
          </div>
          <div className="tension-footnote">
            <p>Whole percentages · Exactly 100% to save · Saved per exercise</p>
            <span role="status">{!complete ? (remaining ? `Assign the remaining ${remaining}% to save.` : "Complete the head distributions to save.") : messages[exercise] || (dirty ? "Unsaved changes" : "")}</span>
          </div>
          {errors[exercise] && <p className="lift-error" role="alert">{errors[exercise]}</p>}
        </>}
    </section>
  );
}
