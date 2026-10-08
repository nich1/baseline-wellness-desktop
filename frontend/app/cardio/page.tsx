"use client";

import { AnalysisNav } from "@/components/AnalysisNav";
import { useEffect, useMemo, useState } from "react";
import { Brand } from "@/components/Brand";
import { MetricChart } from "@/components/MetricChart";
import { api } from "@/lib/api";
import {
  aggregateCardioDays,
  aggregateCardioPerformance,
  aggregateCardioWeeks,
} from "@/lib/cardio-trends";
import { appToday, shiftCalendarDate } from "@/lib/dates";
import type { CardioSession } from "@/lib/types";

type RangeKey = "week" | "month" | "quarter" | "year" | "all";

const ALL_ACTIVITIES = "All activities";
const ranges: Array<{ key: RangeKey; label: string; days: number | null }> = [
  { key: "week", label: "Week", days: 7 },
  { key: "month", label: "Month", days: 30 },
  { key: "quarter", label: "3 months", days: 90 },
  { key: "year", label: "Year", days: 365 },
  { key: "all", label: "All time", days: null },
];

function number(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function duration(minutes: number) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function pace(minutes: number) {
  const totalSeconds = Math.round(minutes * 60);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function CardioTrendsPage() {
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [activity, setActivity] = useState(ALL_ACTIVITIES);
  const [range, setRange] = useState<RangeKey>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.getCardio()
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load cardio trends");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activities = useMemo(
    () => [...new Set(sessions.map((session) => session.activity))].sort(),
    [sessions],
  );

  const visibleSessions = useMemo(() => {
    const days = ranges.find((item) => item.key === range)!.days;
    const cutoff = days === null ? null : shiftCalendarDate(appToday(), -days + 1);
    return sessions.filter((session) => (
      (activity === ALL_ACTIVITIES || session.activity === activity)
      && (cutoff === null || session.logged_on >= cutoff)
    ));
  }, [activity, range, sessions]);

  const daily = useMemo(() => aggregateCardioDays(visibleSessions), [visibleSessions]);
  const weekly = useMemo(() => aggregateCardioWeeks(visibleSessions), [visibleSessions]);
  const performance = useMemo(
    () => activity === ALL_ACTIVITIES
      ? null
      : aggregateCardioPerformance(visibleSessions, activity),
    [activity, visibleSessions],
  );

  const totalMinutes = visibleSessions.reduce(
    (sum, session) => sum + session.duration_minutes,
    0,
  );
  const totalMiles = daily.reduce((sum, day) => sum + day.miles, 0);
  const heartRateMinutes = visibleSessions.reduce(
    (sum, session) => sum + (session.average_heart_rate === null ? 0 : session.duration_minutes),
    0,
  );
  const averageHeartRate = heartRateMinutes
    ? Math.round(visibleSessions.reduce(
        (sum, session) => sum + (session.average_heart_rate ?? 0) * session.duration_minutes,
        0,
      ) / heartRateMinutes)
    : null;

  return (
    <main className="cardio-trends-page">
      <header className="site-header">
        <Brand />
        <AnalysisNav active="/cardio" />
      </header>

      <section className="strength-hero">
        <div className="page-title">
          <h1>Cardio trends</h1>
        </div>
        <label className="exercise-select">
          <span>Activity</span>
          <select value={activity} onChange={(event) => setActivity(event.target.value)}>
            <option>{ALL_ACTIVITIES}</option>
            {activities.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="error-banner"><span>!</span> {error}</div>}

      <section className="trend-stat-grid">
        <article>
          <span>Training time</span>
          <strong>{duration(totalMinutes)}</strong>
          <p>Across selected range</p>
        </article>
        <article>
          <span>Distance</span>
          <strong>{number(totalMiles)}<small>MI</small></strong>
          <p>Normalized across distance units</p>
        </article>
        <article>
          <span>Sessions</span>
          <strong>{visibleSessions.length}</strong>
          <p>{daily.length} active day{daily.length === 1 ? "" : "s"}</p>
        </article>
        <article>
          <span>Average heart rate</span>
          <strong>{averageHeartRate ?? "—"}<small>{averageHeartRate ? "BPM" : ""}</small></strong>
          <p>Weighted by session duration</p>
        </article>
      </section>

      <div className="strength-toolbar">
        <span>{activity}</span>
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

      <section className="cardio-trend-grid">
        <article className="chart-panel">
          <div className="metric-heading">
            <span className="panel-index">TIME</span>
            <div><h2>Weekly training time</h2><p>Total duration by Monday–Sunday training week</p></div>
          </div>
          {loading
            ? <div className="metric-chart-empty"><span className="loader" /> Loading training time...</div>
            : <MetricChart
                points={weekly.map((item) => ({ date: item.date, value: item.minutes }))}
                label="training time"
                unit="min"
                tone="green"
                emptyMessage="Log a cardio session to populate this chart."
              />}
        </article>

        <article className="chart-panel">
          <div className="metric-heading">
            <span className="panel-index">DIST</span>
            <div><h2>Weekly distance</h2><p>Distance normalized to miles across selected activities</p></div>
          </div>
          {loading
            ? <div className="metric-chart-empty"><span className="loader" /> Loading distance...</div>
            : <MetricChart
                points={weekly.filter((item) => item.miles > 0).map((item) => ({ date: item.date, value: item.miles }))}
                label="distance"
                unit="mi"
                tone="orange"
                formatValue={(value) => value.toFixed(1)}
                emptyMessage="Add distance to cardio sessions to populate this chart."
              />}
        </article>

        <article className="chart-panel">
          <div className="metric-heading">
            <span className="panel-index">PERF</span>
            <div>
              <h2>{performance?.label ?? "Pace or speed trend"}</h2>
              <p>{performance
                ? `${performance.lowerIsBetter ? "Lower" : "Higher"} is faster · ${performance.unit}`
                : "Choose one activity to compare like-for-like performance"}</p>
            </div>
          </div>
          {performance === null ? (
            <div className="metric-chart-empty">
              <strong>Select an activity</strong>
              <span>Runs, rides, swims, and rows use different performance measures.</span>
            </div>
          ) : (
            <MetricChart
              points={performance.points}
              label={performance.label.toLowerCase()}
              unit={performance.unit}
              tone="green"
              formatValue={performance.unit === "mph" ? (value) => value.toFixed(1) : pace}
              emptyMessage={`Add distance to ${activity.toLowerCase()} sessions to see performance.`}
            />
          )}
        </article>

        <article className="chart-panel">
          <div className="metric-heading">
            <span className="panel-index">HR</span>
            <div><h2>Heart-rate trend</h2><p>Duration-weighted average by training day</p></div>
          </div>
          {loading
            ? <div className="metric-chart-empty"><span className="loader" /> Loading heart rate...</div>
            : <MetricChart
                points={daily.flatMap((item) => item.averageHeartRate === null ? [] : [{ date: item.date, value: item.averageHeartRate }])}
                label="heart rate"
                unit="bpm"
                tone="orange"
                emptyMessage="Add average heart rate to sessions to populate this chart."
              />}
        </article>
      </section>

      <div className="formula-note">
        Time and heart rate are comparable across activities. Pace and speed are shown only for one selected activity so unlike workouts are not mixed.
      </div>

      <footer>
        <span>Baseline</span>
        <span>Cardio trends</span>
      </footer>
    </main>
  );
}
