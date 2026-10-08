"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LiftSet } from "@/lib/types";

type Props = { date: string };
type EditDraft = { id: number; exercise: string; weight: string; reps: string };

function number(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function DailyLifts({ date }: Props) {
  const [lifts, setLifts] = useState<LiftSet[]>([]);
  const [exerciseNames, setExerciseNames] = useState<string[]>([]);
  const [exercise, setExercise] = useState("");
  const [addingExercise, setAddingExercise] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<"add" | "edit" | "delete" | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [error, setError] = useState("");
  const editorId = useId();
  const busy = operation !== null;
  const showNewExercise = !loading && (addingExercise || !exerciseNames.length);

  useEffect(() => {
    let active = true;
    Promise.all([api.getLifts({ loggedOn: date }), api.getLifts(), api.getExerciseTensions().catch(() => [])])
      .then(([daily, all, profiles]) => {
        if (active) {
          setLifts(daily);
          setExerciseNames(
            [...new Set([...all.map(item => item.exercise), ...profiles.map(profile => profile.exercise)])].sort(),
          );
        }
      })
      .catch((cause) => {
        if (active) {
          const message = cause instanceof Error ? cause.message : "Could not load lifts";
          setError(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const volume = useMemo(
    () => lifts.reduce((sum, lift) => sum + lift.weight * lift.reps, 0),
    [lifts],
  );
  const bestStrength = useMemo(
    () => lifts.reduce(
      (best, lift) => Math.max(best, lift.weight * (1 + lift.reps / 30)),
      0,
    ),
    [lifts],
  );

  async function addLift(event: FormEvent) {
    event.preventDefault();
    if (!exercise.trim()) {
      setError("Enter an exercise name.");
      return;
    }
    setOperation("add");
    setError("");
    try {
      const created = await api.createLift({
        logged_on: date,
        exercise: exercise.trim(),
        weight: Number(weight),
        reps: Number(reps),
      });
      setLifts((current) => [...current, created]);
      setExerciseNames((current) =>
        current.includes(created.exercise)
          ? current
          : [...current, created.exercise].sort(),
      );
      setExercise(created.exercise);
      setAddingExercise(false);
      setWeight("");
      setReps("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save lift");
    } finally {
      setOperation(null);
    }
  }

  async function removeLift(lift: LiftSet) {
    setOperation("delete");
    setError("");
    try {
      await api.deleteLift(lift.id);
      setLifts((current) => current.filter((item) => item.id !== lift.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete lift");
    } finally {
      setOperation(null);
    }
  }

  function startEdit(lift: LiftSet) {
    setError("");
    setEditError("");
    setEditing({ id: lift.id, exercise: lift.exercise, weight: String(lift.weight), reps: String(lift.reps) });
  }

  function finishEdit(id: number) {
    setEditing(null);
    setEditError("");
    requestAnimationFrame(() => document.getElementById(`${editorId}-button-${id}`)?.focus());
  }

  async function saveEdit(event: FormEvent, lift: LiftSet) {
    event.preventDefault();
    if (!editing || editing.id !== lift.id || busy) return;
    const name = editing.exercise.trim();
    const editedWeight = Number(editing.weight), editedReps = Number(editing.reps);
    if (!name) { setEditError("Enter an exercise name."); return; }
    if (!Number.isFinite(editedWeight) || editedWeight <= 0 || !Number.isInteger(editedReps) || editedReps < 1 || editedReps > 100) {
      setEditError("Enter a positive weight and between 1 and 100 whole reps.");
      return;
    }
    setOperation("edit");
    setEditError("");
    try {
      const updated = await api.updateLift(lift.id, {
        logged_on: lift.logged_on, exercise: name, weight: editedWeight, reps: editedReps,
      });
      setLifts(current => current.map(item => item.id === updated.id ? updated : item));
      setExerciseNames(current => current.includes(updated.exercise) ? current : [...current, updated.exercise].sort());
      finishEdit(lift.id);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not update set");
    } finally {
      setOperation(null);
    }
  }

  return (
    <section className="daily-lifts">
      <div className="daily-lifts-header">
        <div>
          <div>
            <h2>Daily lifts</h2>
          </div>
        </div>
        <Link href="/strength">View trends</Link>
      </div>

      {error && <div className="lift-error" role="alert">{error}</div>}

      <form className="lift-form" onSubmit={addLift}>
        <div className="lift-exercise-field">
          <label className="field">
            <span>Exercise</span>
            <select
              required
              disabled={loading || busy}
              value={showNewExercise ? "new" : exercise ? `saved:${exercise}` : ""}
              onChange={(event) => {
                const isNew = event.target.value === "new";
                setAddingExercise(isNew);
                setExercise(isNew ? "" : event.target.value.slice(6));
              }}
            >
              <option value="" disabled>
                {loading ? "Loading exercises..." : "Select an exercise"}
              </option>
              {exerciseNames.map((name) => (
                <option key={name} value={`saved:${name}`}>{name}</option>
              ))}
              <option value="new">+ Add new exercise…</option>
            </select>
          </label>
          {showNewExercise && (
            <label className="field">
              <span>New exercise name</span>
              <input
                required
                disabled={busy}
                value={exercise}
                onChange={(event) => setExercise(event.target.value)}
                placeholder="e.g. Bench press"
                maxLength={120}
              />
            </label>
          )}
        </div>
        <label className="field">
          <span>Weight</span>
          <div className="input-unit">
            <input
              required
              disabled={busy}
              type="number"
              min=".1"
              step=".1"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              placeholder="0"
            />
            <b>LB</b>
          </div>
        </label>
        <label className="field">
          <span>Reps</span>
          <input
            required
            disabled={busy}
            type="number"
            min="1"
            max="100"
            step="1"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            placeholder="0"
          />
        </label>
        <button className="button primary" disabled={busy || loading}>
          {operation === "add" ? "Saving..." : "+ Add set"}
        </button>
      </form>

      <div className="lift-content">
        {loading ? (
          <div className="lift-empty"><span className="loader" /> Loading lifts...</div>
        ) : lifts.length === 0 ? (
          <div className="lift-empty">
            <strong>No sets logged</strong>
            <span>Add a set above to start today&apos;s workout.</span>
          </div>
        ) : (
          <div className="lift-list">
            {lifts.map((lift, index) => (
              <article key={lift.id} data-lift-id={lift.id} className={editing?.id === lift.id ? "is-editing" : undefined}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{lift.exercise}</strong><small>SET</small></div>
                <div><strong>{number(lift.weight)} lb</strong><small>WEIGHT</small></div>
                <div><strong>× {lift.reps}</strong><small>REPS</small></div>
                <div><strong>{number(lift.weight * lift.reps)}</strong><small>VOLUME</small></div>
                <div className="lift-row-actions">
                  <button type="button" id={`${editorId}-button-${lift.id}`}
                    disabled={busy || (editing !== null && editing.id !== lift.id)}
                    aria-label={`Edit ${lift.exercise} set`}
                    aria-expanded={editing?.id === lift.id}
                    aria-controls={editing?.id === lift.id ? `${editorId}-form-${lift.id}` : undefined}
                    onClick={() => {
                      if (editing?.id === lift.id) document.getElementById(`${editorId}-weight-${lift.id}`)?.focus();
                      else startEdit(lift);
                    }}>Edit</button>
                  <button type="button" className="lift-delete" disabled={busy || editing !== null}
                    onClick={() => removeLift(lift)} aria-label={`Delete ${lift.exercise} set`}>×</button>
                </div>
                {editing?.id === lift.id && <form className="lift-edit-form" id={`${editorId}-form-${lift.id}`}
                  aria-label={`Edit set ${index + 1}`} onSubmit={event => saveEdit(event, lift)}
                  onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); finishEdit(lift.id); } }}>
                  <div className="lift-edit-heading"><span>Edit set {String(index + 1).padStart(2, "0")}</span><span>Weight in lb</span></div>
                  {editError && <p className="lift-edit-error" role="alert">{editError}</p>}
                  <label className="field lift-edit-exercise"><span>Exercise</span>
                    <input required maxLength={120} list={`${editorId}-exercises`} disabled={busy}
                      value={editing.exercise} onChange={event => setEditing({ ...editing, exercise: event.target.value })} />
                  </label>
                  <datalist id={`${editorId}-exercises`}>{exerciseNames.map(name => <option key={name} value={name} />)}</datalist>
                  <label className="field"><span>Weight</span>
                    <div className="input-unit"><input autoFocus required type="number" min=".1" step=".1" disabled={busy}
                      id={`${editorId}-weight-${lift.id}`} value={editing.weight}
                      onFocus={event => event.currentTarget.select()}
                      onChange={event => setEditing({ ...editing, weight: event.target.value })} /><b>LB</b></div>
                  </label>
                  <label className="field"><span>Reps</span>
                    <input required type="number" min="1" max="100" step="1" disabled={busy} value={editing.reps}
                      onFocus={event => event.currentTarget.select()}
                      onChange={event => setEditing({ ...editing, reps: event.target.value })} />
                  </label>
                  <div className="lift-edit-actions">
                    <button type="button" className="button" disabled={busy} onClick={() => finishEdit(lift.id)}>Cancel</button>
                    <button className="button primary" disabled={busy}>{operation === "edit" ? "Saving…" : "Save changes"}</button>
                  </div>
                </form>}
              </article>
            ))}
          </div>
        )}
        <aside className="lift-summary">
          <div><span>SETS</span><strong>{lifts.length}</strong></div>
          <div><span>VOLUME</span><strong>{number(volume)}<small>LB</small></strong></div>
          <div><span>BEST EST. 1RM</span><strong>{bestStrength ? number(bestStrength) : "—"}<small>LB</small></strong></div>
        </aside>
      </div>
    </section>
  );
}
