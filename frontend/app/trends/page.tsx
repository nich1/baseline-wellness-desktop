"use client";

import { AnalysisNav } from "@/components/AnalysisNav";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Brand } from "@/components/Brand";
import { WeightChart } from "@/components/WeightChart";
import { WeightHistoryTable } from "@/components/WeightHistoryTable";
import { api } from "@/lib/api";
import { BodyWeightRecord } from "@/lib/types";
import { calculateWeightTrend, MIN_TREND_SPAN_DAYS, MIN_TREND_WEIGH_INS, TREND_WINDOW_DAYS } from "@/lib/weight-trends";

type RangeKey = "week" | "month" | "quarter" | "year" | "all";

const ranges: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "quarter", label: "3 months", days: 90 },
  { key: "year", label: "Year", days: 365 },
  { key: "all", label: "All time", days: null },
];

function displayWeight(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

export default function TrendsPage() {
  const [records, setRecords] = useState<BodyWeightRecord[]>([]);
  const [goal, setGoal] = useState<number | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [range, setRange] = useState<RangeKey>("month");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.getBodyweights(), api.getBodyweightGoal()])
      .then(([weightRecords, savedGoal]) => {
        if (active) {
          setRecords(weightRecords);
          setGoal(savedGoal?.weight ?? null);
          setGoalInput(savedGoal?.weight.toString() ?? "");
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load trends");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleRecords = useMemo(() => {
    const days = ranges.find((item) => item.key === range)!.days;
    if (days === null) return records;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days + 1);
    return records.filter(
      (record) => new Date(`${record.logged_on}T12:00:00`) >= cutoff,
    );
  }, [range, records]);

  const trend = useMemo(
    () => calculateWeightTrend(records, goal),
    [records, goal],
  );
  const latest = records.at(-1)?.weight ?? null;
  const rangeChange = visibleRecords.length > 1
    ? visibleRecords.at(-1)!.weight - visibleRecords[0].weight
    : null;
  const goalDifference = goal !== null && trend.trendWeight !== null
    ? goal - trend.trendWeight
    : null;

  async function saveGoal(event: FormEvent) {
    event.preventDefault();
    const nextGoal = Number(goalInput);
    if (nextGoal <= 0) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api.updateBodyweightGoal(nextGoal);
      setGoal(saved.weight);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save goal");
    } finally {
      setSaving(false);
    }
  }

  const statusLabels = {
    "no-goal": "Set a goal to see your progress",
    "insufficient-data": "More recent weigh-ins needed",
    "at-goal": "At your goal",
    "steady": "Weight trend is steady",
    "toward-goal": "Trending toward goal",
    "away-from-goal": "Trending away from goal",
  };
  let forecast = "Set a goal to calculate your projection.";
  if (trend.status === "insufficient-data") {
    forecast = `A trend needs at least ${MIN_TREND_WEIGH_INS} weigh-ins spanning ${MIN_TREND_SPAN_DAYS} calendar days within the last ${TREND_WINDOW_DAYS} days.`;
  } else if (trend.status === "at-goal") {
    forecast = "Your fitted trend weight is at your saved goal.";
  } else if (goal !== null && trend.projectedDate) {
    forecast = `Tentative estimate: ${goal.toFixed(1)} lb around ${trend.projectedDate.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}, if this pace continues.`;
  } else if (trend.status === "toward-goal") {
    forecast = "Your recent trend is moving toward your goal, but an arrival date is not available yet.";
  } else if (trend.status === "steady") {
    forecast = "Your recent trend is too flat to estimate an arrival date.";
  } else if (trend.status === "away-from-goal") {
    forecast = "Your recent trend is moving away from your saved goal, so there is no arrival estimate yet.";
  }

  return (
    <main className="trends-page">
      <header className="site-header">
        <Brand />
        <AnalysisNav active="/trends" />
      </header>

      <section className="trends-hero">
        <div className="page-title">
          <h1>Bodyweight trends</h1>
        </div>
        <form className="goal-form" onSubmit={saveGoal}>
          <span>Bodyweight goal</span>
          <div>
            <input
              type="number"
              min="1"
              step=".1"
              required
              value={goalInput}
              onChange={(event) => setGoalInput(event.target.value)}
              placeholder="Set goal"
            />
            <b>LB</b>
            <button disabled={saving}>{saving ? "Saving" : "Save"}</button>
          </div>
        </form>
      </section>

      {error && <div className="error-banner"><span>!</span> {error}</div>}

      <section className="trend-stat-grid">
        <article>
          <span>Latest weight</span>
          <strong>{displayWeight(latest)}<small>LB</small></strong>
          <p>{records.at(-1)?.logged_on ?? "No entries"}</p>
        </article>
        <article>
          <span>7-entry average</span>
          <strong>{displayWeight(trend.latestAverage)}<small>LB</small></strong>
          <p>Moving average</p>
        </article>
        <article>
          <span>Current rate</span>
          <strong>
            {trend.weeklyRate === null ? "—" : `${trend.weeklyRate > 0 ? "+" : ""}${trend.weeklyRate.toFixed(2)}`}
            <small>LB/WK</small>
          </strong>
          <p>Last {TREND_WINDOW_DAYS} calendar days</p>
        </article>
        <article>
          <span>Trend weight to goal</span>
          <strong>{goalDifference === null ? "—" : Math.abs(goalDifference).toFixed(1)}<small>LB</small></strong>
          <p>{goal === null ? "Goal not set" : goalDifference === null ? "More data needed" : trend.status === "at-goal" ? "At goal" : goalDifference < 0 ? "To lose" : "To gain"}</p>
        </article>
      </section>

      <div className="weight-workspace">
      <div className="weight-analysis">
      <section className="chart-panel">
        <div className="chart-panel-header">
          <div>
            <h2>Weight history</h2>
          </div>
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
        {loading ? (
          <div className="weight-chart-empty"><span className="loader" /> Loading trend...</div>
        ) : (
          <WeightChart records={visibleRecords} goal={goal} />
        )}
        <div className="range-summary">
          <span>Range change</span>
          <strong>
            {rangeChange === null ? "—" : `${rangeChange > 0 ? "+" : ""}${rangeChange.toFixed(1)} lb`}
          </strong>
          <span>{visibleRecords.length} weigh-ins</span>
        </div>
      </section>

      <section className="forecast-panel">
        <div>
          <p>Goal projection</p>
          <h2>{loading ? "Loading projection…" : statusLabels[trend.status]}</h2>
          {!loading && <p className="forecast-detail">{forecast}</p>}
          <small>
            Uses weigh-ins from the last {TREND_WINDOW_DAYS} calendar days. The estimate starts
            from your fitted trend weight and assumes the recent pace continues.
            Estimated dates can change as you log more weights.
          </small>
        </div>
      </section>
      </div>

      <WeightHistoryTable loading={loading} records={records} />
      </div>

      <footer>
        <span>Baseline</span>
        <span>Bodyweight trends</span>
      </footer>
    </main>
  );
}
