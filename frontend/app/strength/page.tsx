"use client";

import { TensionEditor } from "@/components/TensionEditor";
import { AnalysisNav } from "@/components/AnalysisNav";
import { useEffect, useMemo, useState } from "react";
import { Brand } from "@/components/Brand";
import { MetricChart } from "@/components/MetricChart";
import { api } from "@/lib/api";
import { LiftSet } from "@/lib/types";
import { aggregateExerciseDays } from "@/lib/lift-trends";

type RangeKey = "week" | "month" | "quarter" | "year" | "all";

const ranges: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "quarter", label: "3 months", days: 90 },
  { key: "year", label: "Year", days: 365 },
  { key: "all", label: "All time", days: null },
];

function number(value: number | null) {
  if (value === null) return "—";
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

export default function StrengthPage() {
  const [lifts, setLifts] = useState<LiftSet[]>([]);
  const [configuredExercises, setConfiguredExercises] = useState<string[]>([]);
  const [exercise, setExercise] = useState("");
  const [range, setRange] = useState<RangeKey>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.getLifts(), api.getExerciseTensions().catch(() => [])])
      .then(([data, profiles]) => {
        if (active) {
          setLifts(data);
          const loggedNames = [...new Set(data.map(lift => lift.exercise))].sort();
          const configuredNames = profiles.map(profile => profile.exercise).sort();
          setConfiguredExercises(configuredNames);
          setExercise(loggedNames[0] ?? configuredNames[0] ?? "");
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load lifts");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const exercises = useMemo(
    () => [...new Set([...lifts.map(lift => lift.exercise), ...configuredExercises])].sort(),
    [lifts, configuredExercises],
  );
  const allDays = useMemo(
    () => aggregateExerciseDays(lifts, exercise),
    [exercise, lifts],
  );
  const visibleDays = useMemo(() => {
    const days = ranges.find((item) => item.key === range)!.days;
    if (days === null) return allDays;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days + 1);
    return allDays.filter((day) => new Date(`${day.date}T12:00:00`) >= cutoff);
  }, [allDays, range]);

  const latestStrength = visibleDays.at(-1)?.strength ?? null;
  const bestStrength = visibleDays.length
    ? Math.max(...visibleDays.map((day) => day.strength))
    : null;
  const totalVolume = visibleDays.reduce((sum, day) => sum + day.volume, 0);
  const totalSets = visibleDays.reduce((sum, day) => sum + day.sets, 0);

  return (
    <main className="strength-page">
      <header className="site-header">
        <Brand />
        <AnalysisNav active="/strength" />
      </header>

      <section className="strength-hero">
        <div className="page-title">
          <h1>Strength trends</h1>
        </div>
        <label className="exercise-select">
          <span>Exercise</span>
          <select
            value={exercise}
            onChange={(event) => setExercise(event.target.value)}
            disabled={!exercises.length}
          >
            {!exercises.length && <option>No exercises available</option>}
            {exercises.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="error-banner"><span>!</span> {error}</div>}

      <section className="trend-stat-grid">
        <article>
          <span>Latest estimated 1RM</span>
          <strong>{number(latestStrength)}<small>LB</small></strong>
          <p>Epley formula</p>
        </article>
        <article>
          <span>Range PR</span>
          <strong>{number(bestStrength)}<small>LB</small></strong>
          <p>Best estimated 1RM</p>
        </article>
        <article>
          <span>Range volume</span>
          <strong>{number(totalVolume)}<small>LB</small></strong>
          <p>Weight × reps</p>
        </article>
        <article>
          <span>Work sets</span>
          <strong>{totalSets}<small>SETS</small></strong>
          <p>{visibleDays.length} training days</p>
        </article>
      </section>

      <div className="strength-workspace">
        <aside className="strength-setup"><TensionEditor exercise={exercise} /></aside>
        <div className="strength-analysis">
      <div className="strength-toolbar">
        <span>{exercise || "Select an exercise"}</span>
        <div className="range-tabs">
          {ranges.map((item) => (
            <button
              className={range === item.key ? "active" : ""}
              key={item.key}
              onClick={() => setRange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section className="strength-chart-grid">
        <article className="chart-panel">
          <div className="metric-heading">
            <span className="panel-index">1RM</span>
            <div><h2>Strength trend</h2><p>Best estimated 1RM by day</p></div>
          </div>
          {loading
            ? <div className="metric-chart-empty"><span className="loader" /> Loading strength...</div>
            : <MetricChart
                key={exercise}
                points={visibleDays.map((day) => ({
                  date: day.date,
                  value: day.strength,
                  details: [
                    `Best set: ${number(day.bestSet.weight)} lb × ${day.bestSet.reps} reps`,
                    `${day.sets} ${day.sets === 1 ? "set" : "sets"} logged`,
                  ],
                }))}
                label="strength"
                valueLabel="Estimated 1RM"
                unit="lb"
                tone="orange"
              />}
        </article>

        <article className="chart-panel">
          <div className="metric-heading">
            <span className="panel-index">VOL</span>
            <div><h2>Volume trend</h2><p>Total weight × reps by day</p></div>
          </div>
          {loading
            ? <div className="metric-chart-empty"><span className="loader" /> Loading volume...</div>
            : <MetricChart
                key={exercise}
                points={visibleDays.map((day) => ({
                  date: day.date,
                  value: day.volume,
                  details: [
                    `${day.sets} ${day.sets === 1 ? "set" : "sets"} · ${day.reps} total reps`,
                    `Weight: ${number(day.minWeight)}${day.minWeight === day.maxWeight ? "" : `–${number(day.maxWeight)}`} lb`,
                  ],
                }))}
                label="volume"
                valueLabel="Total volume"
                unit="lb"
                tone="green"
              />}
        </article>
      </section>

      <div className="formula-note">
        Estimated 1RM = weight × (1 + reps ÷ 30). Volume = sum of weight × reps.
      </div>

        </div>
      </div>

      <footer>
        <span>Baseline</span>
        <span>Strength trends</span>
      </footer>
    </main>
  );
}
