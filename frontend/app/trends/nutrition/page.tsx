"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnalysisNav } from "@/components/AnalysisNav";
import { Brand } from "@/components/Brand";
import { NutritionWeekChart, type NutritionSeries } from "@/components/NutritionWeekChart";
import { api } from "@/lib/api";
import { appToday, shiftCalendarDate } from "@/lib/dates";
import { buildNutritionWeek, nutritionAverage, nutritionDate, nutritionMetrics, nutritionNumber as fmt, nutritionWeekStart, type NutritionMetric } from "@/lib/nutrition-trends";
import type { NutritionTargets, TargetDay } from "@/lib/types";
import "./nutrition.css";

const macros: NutritionSeries[] = [
  { key: "protein", label: "Protein", color: "var(--nutrition-protein)" },
  { key: "carbohydrates", label: "Carbs", color: "var(--nutrition-carbs)" },
  { key: "fat", label: "Fat", color: "var(--nutrition-fat)" },
];

export default function NutritionTrendsPage() {
  const today = appToday();
  const currentWeek = nutritionWeekStart(today);
  const [week, setWeek] = useState(currentWeek);
  const [history, setHistory] = useState<TargetDay[]>([]);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState<NutritionMetric>("fiber");
  const end = shiftCalendarDate(week, 6);

  useEffect(() => {
    let active = true;
    Promise.all([api.getTargetHistory(week, end < today ? end : today), api.getTargets()])
      .then(([days, goals]) => { if (active) { setHistory(days); setTargets(goals); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load nutrition history"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [week, end, today, attempt]);

  function chooseWeek(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || date > today) return;
    const next = nutritionWeekStart(date);
    if (next === week) return;
    setLoading(true); setError(""); setWeek(next);
  }

  const days = buildNutritionWeek(history, week, today);
  const logged = days.filter(day => day.status === "logged");
  const elapsed = days.filter(day => day.status !== "future").length;
  const selectedMetric = nutritionMetrics.find(metric => metric.key === detail)!;
  const selectedTarget = targets?.[detail] ?? null;
  const available = !loading && !error;
  const weekLabel = `${nutritionDate(week)} – ${nutritionDate(end, { month: "short", day: "numeric", year: "numeric" })}`;

  return <main className="trends-page nutrition-trends-page">
    <header className="site-header"><Brand /><AnalysisNav active="/trends/nutrition" /></header>
    <section className="trends-hero nutrition-hero">
      <div className="page-title"><h1>Nutrition trends</h1><p>A weekly view of what you’ve logged.</p></div>
      <div className="nutrition-week-controls">
        <label htmlFor="nutrition-week">Week containing</label>
        <div>
          <button aria-label="Previous nutrition week" onClick={() => chooseWeek(shiftCalendarDate(week, -7))}>‹</button>
          <input id="nutrition-week" type="date" value={week} max={today} onChange={event => chooseWeek(event.target.value)} />
          <button aria-label="Next nutrition week" disabled={week >= currentWeek} onClick={() => chooseWeek(shiftCalendarDate(week, 7))}>›</button>
          <button className="nutrition-this-week" disabled={week === currentWeek} onClick={() => chooseWeek(today)}>This week</button>
        </div>
      </div>
    </section>

    <div className="nutrition-week-heading">
      <h2>{weekLabel}</h2>
      <span>{available ? `${logged.length} of ${elapsed} ${week === currentWeek ? "days so far" : "days"} logged` : loading ? "Loading week…" : "Week unavailable"}{week === currentWeek && " · In progress"}</span>
    </div>
    {error && <div className="error-banner nutrition-error" role="alert"><span>{error}</span><button onClick={() => { setError(""); setLoading(true); setAttempt(value => value + 1); }}>Retry</button></div>}

    <section className="trend-stat-grid" aria-label="Daily nutrition averages" aria-busy={loading}>
      {nutritionMetrics.slice(0, 4).map(metric => <article key={metric.key}>
        <span>Average {metric.label.toLowerCase()}</span>
        <strong>{available ? fmt(nutritionAverage(days, metric.key)) : "—"}<small>{metric.unit.toUpperCase()}/DAY</small></strong>
        <p>{available && targets?.[metric.key] != null ? `Current daily target: ${fmt(targets[metric.key]!)} ${metric.unit}` : "Current daily target: —"}</p>
      </article>)}
    </section>

    <p className="nutrition-method">Averages use logged days only. Missing days aren’t zero intake; logged days may be incomplete. Target lines use your current saved targets. <Link href="/targets">Edit targets</Link></p>

    {loading ? <div className="nutrition-loading" role="status"><span className="loader" /> Loading weekly nutrition…</div> : !error && <>
      {!logged.length && <div className="nutrition-empty"><strong>No food logged this week</strong><span>Browse another week or <Link href="/">add food to your daily log</Link> to start seeing trends.</span></div>}
      <div className="nutrition-chart-grid">
        <section className="chart-panel">
          <div className="chart-panel-header"><div><h2>Daily calories</h2><p>Recorded intake and your daily target</p></div></div>
          <div className="nutrition-chart-legend"><span><i style={{ background: "var(--chart, var(--accent))" }} />Calories</span><span><i className="nutrition-target-key" />{targets ? `Target ${fmt(targets.calories)} kcal` : "No target set"}</span></div>
          <NutritionWeekChart key={week} days={days} series={[{ key: "calories", label: "Calories", color: "var(--chart, var(--accent))" }]} unit="kcal" label="Daily calories, Monday through Sunday" target={targets?.calories} />
        </section>
        <section className="chart-panel">
          <div className="chart-panel-header"><div><h2>Daily macros</h2><p>Protein, carbs, and fat in grams</p></div></div>
          <div className="nutrition-chart-legend">{macros.map(macro => <span key={macro.key}><i style={{ background: macro.color }} />{macro.label}</span>)}</div>
          <NutritionWeekChart key={week} days={days} series={macros} unit="g" label="Daily protein, carbs, and fat, Monday through Sunday" />
        </section>
      </div>

      <div className="nutrition-detail-grid">
        <section className="chart-panel nutrition-detail-panel">
          <div className="chart-panel-header"><h2>Nutrient detail</h2><select aria-label="Nutrient to chart" value={detail} onChange={event => setDetail(event.target.value as NutritionMetric)}>{nutritionMetrics.slice(4).map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></div>
          <div className="nutrition-chart-legend"><span><i style={{ background: "var(--chart, var(--accent))" }} />{selectedMetric.label}</span><span><i className="nutrition-target-key" />{selectedTarget === null ? "No target set" : `${detail === "fiber" ? "Minimum" : "Limit"} ${fmt(selectedTarget)} g`}</span></div>
          <NutritionWeekChart key={`${week}-${detail}`} days={days} series={[{ key: detail, label: selectedMetric.label, color: "var(--chart, var(--accent))" }]} unit="g" label={`${selectedMetric.label}, Monday through Sunday`} target={selectedTarget} />
          <div className="range-summary"><span>Logged-day average</span><strong>{fmt(nutritionAverage(days, detail))} g</strong></div>
        </section>

        <section className="nutrition-history-panel" aria-labelledby="nutrition-history-title">
          <div className="chart-panel-header"><div><h2 id="nutrition-history-title">Daily breakdown</h2><p>Monday–Sunday · all nutrients in grams except calories</p></div></div>
          <div className="nutrition-table-scroll" tabIndex={0} role="region" aria-label="Daily nutrition table; scroll horizontally for all nutrients">
            <table className="nutrition-history-table">
              <thead><tr><th scope="col">Day</th>{nutritionMetrics.map(metric => <th key={metric.key} scope="col">{metric.label}{metric.key === "calories" && <small>kcal</small>}</th>)}</tr></thead>
              <tbody>{days.map(day => <tr key={day.date} className={day.date === today ? "is-today" : ""} data-status={day.status}>
                <th scope="row"><strong>{nutritionDate(day.date, { weekday: "short" })} <span>{nutritionDate(day.date)}</span></strong><small>{day.date === today ? "Today · " : ""}{day.status === "future" ? "Upcoming" : day.status === "missing" ? "Not logged" : `${day.entries} food ${day.entries === 1 ? "entry" : "entries"}`}</small></th>
                {nutritionMetrics.map(metric => <td key={metric.key}>{fmt(day.nutrients?.[metric.key] ?? null)}</td>)}
              </tr>)}</tbody>
              <tfoot><tr><th scope="row">Daily average<small>{logged.length} logged {logged.length === 1 ? "day" : "days"}</small></th>{nutritionMetrics.map(metric => <td key={metric.key}>{fmt(nutritionAverage(days, metric.key))}</td>)}</tr></tfoot>
            </table>
          </div>
        </section>
      </div>
      <p className="nutrition-method">Nutrient totals reflect saved food values. Unspecified nutrients in a food entry are recorded as zero.</p>
    </>}
    <footer><span>Baseline</span><span>Nutrition trends</span></footer>
  </main>;
}
