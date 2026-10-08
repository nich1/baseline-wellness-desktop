"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { AnalysisNav } from "@/components/AnalysisNav";
import { MetricChart } from "@/components/MetricChart";
import { api } from "@/lib/api";
import { appToday, shiftCalendarDate } from "@/lib/dates";
import { targetFields, targetStatus } from "@/lib/targets";
import type { NutritionTargets, TargetDay } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
function monday(date: string) { return shiftCalendarDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7)); }
export default function TargetTrendsPage() {
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [history, setHistory] = useState<TargetDay[]>([]);
  const [range, setRange] = useState(30);
  const [section, setSection] = useState("Nutrition");
  const [metric, setMetric] = useState("calories");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const today = appToday();
  const start = shiftCalendarDate(today, 1 - range);
  useEffect(() => {
    let active = true;
    Promise.all([api.getTargets(), api.getTargetHistory(monday(start), today)]).then(([goals, days]) => {
      if (active) { setTargets(goals); setHistory(days); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [start, today]);
  const visible = history.filter(d => d.date >= start);
  const logged = visible.filter(d => d.entries > 0);
  const fields = targetFields.filter(f => f.group === section);
  const nutrient = targetFields.find(f => f.key === metric)!;
  const weeks = new Map<string, TargetDay[]>();
  for (const day of history) { const key = monday(day.date); weeks.set(key, [...(weeks.get(key) ?? []), day]); }
  function actual(days: TargetDay[], key: string) {
    if (key === "strength_days") return days.filter(d => d.strength_sets > 0).length;
    if (key === "cardio_days") return days.filter(d => d.cardio_sessions > 0).length;
    return days.reduce((sum, d) => sum + Number(d[key as keyof TargetDay] ?? 0), 0);
  }
  return <main className="target-trends-page">
    <header className="site-header"><Brand /><AnalysisNav active="/trends/targets" /></header>
    <section className="strength-hero"><div className="page-title"><h1>Target progress</h1></div><Link className="button target-edit" href="/targets">Edit targets</Link></section>
    <div className="target-help">History is compared with your current targets. Changing a target updates these comparisons. Nutrition reflects recorded foods; an unlogged day is not counted as meeting a limit.</div>
    <div className="strength-toolbar">
      <div className="range-tabs">{["Nutrition", "Strength", "Cardio"].map(s => <button key={s} className={section === s ? "active" : ""} aria-pressed={section === s} onClick={() => setSection(s)}>{s}</button>)}</div>
      <div className="range-tabs">{[[7, "Week"], [30, "Month"], [90, "3 months"], [365, "Year"]].map(([n, label]) => <button key={n} className={range === n ? "active" : ""} onClick={() => { setLoading(true); setError(""); setRange(Number(n)); }} disabled={range === n}>{label}</button>)}</div>
    </div>
    {error ? <div className="error-banner" role="alert">{error}</div> : loading ? <div className="metric-chart-empty">Loading target progress…</div> : targets && <>
      {section === "Nutrition" ? <>
        <section className="target-progress-grid">{fields.map(f => {
          const goal = targets[f.key];
          const avg = logged.length ? logged.reduce((sum, d) => sum + d.nutrients[f.key], 0) / logged.length : null;
          const count = goal == null ? 0 : logged.filter(d => f.kind === "minimum" ? d.nutrients[f.key] >= goal : d.nutrients[f.key] <= goal).length;
          return <article key={f.key}><h2>{f.label}</h2><strong>{avg === null ? "—" : fmt(avg)} <small>{f.unit}/day</small></strong><p>{goal == null ? "Target not set" : `${f.kind}: ${fmt(goal)} ${f.unit}/day`}</p><p>{goal == null ? "Set a target to compare progress." : `${count} of ${logged.length} logged days ${f.kind === "minimum" ? "met minimum" : f.kind === "limit" ? "within limit" : "at or below budget"}`}</p></article>;
        })}</section>
        <div className="target-history-layout"><section className="chart-panel"><div className="chart-panel-header"><h2>Daily nutrition</h2><label>Metric <select value={metric} onChange={e => setMetric(e.target.value)}>{fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label></div>
          <MetricChart points={logged.map(d => ({ date: d.date, value: d.nutrients[metric] }))} label={nutrient.label} unit={nutrient.unit} tone="green" formatValue={fmt} target={targets[nutrient.key]} emptyMessage="Log food to see daily nutrition history." />
        </section>
        <p className="target-help target-history-note">{logged.length} logged days of {visible.length}. Averages use logged days only; missing nutrient values in food entries count as zero. Today may still be incomplete.</p>
        <div className="target-table-scroll"><table className="target-table"><caption>{nutrient.label} history · newest first</caption><thead><tr><th>Date</th><th>Recorded</th><th>Current {nutrient.kind}</th><th>Difference</th><th>Status</th></tr></thead><tbody>{[...visible].reverse().map(d => {
          const goal = targets[nutrient.key]; const value = d.nutrients[metric];
          return <tr key={d.date}><td>{d.date}</td><td>{d.entries ? `${fmt(value)} ${nutrient.unit}` : "—"}</td><td>{goal == null ? "Not set" : `${fmt(goal)} ${nutrient.unit}`}</td><td>{!d.entries || goal == null ? "—" : `${value > goal ? "+" : ""}${fmt(value - goal)} ${nutrient.unit}`}</td><td>{!d.entries ? "Not logged" : goal == null ? "No target" : targetStatus(value, goal, nutrient.kind)}</td></tr>;
        })}</tbody></table></div></div>
      </> : <>
        <p className="target-help">Full Monday–Sunday weeks intersecting this range are shown. The current week includes Monday through today. Days and sets refer to logged activity; missing sessions are not inferred.</p>
        <div className="target-table-scroll"><table className="target-table"><caption>{section} weekly progress · newest first</caption><thead><tr><th>Week beginning</th>{fields.map(f => <th key={f.key}>{f.label}</th>)}<th>{section === "Strength" ? "Volume (lb × reps)" : "Sessions"}</th></tr></thead><tbody>{[...weeks].reverse().map(([week, days]) => <tr key={week}><td>{week}{week === monday(today) && <small> · In progress</small>}</td>{fields.map(f => { const value = actual(days, f.key); const goal = targets[f.key]; return <td key={f.key}><strong>{fmt(value)}{goal != null && ` / ${fmt(goal)}`} {f.unit}</strong><small>{goal == null ? "No target" : value >= goal ? "Met" : `${fmt(goal - value)} ${f.unit} remaining`}</small></td>; })}<td>{fmt(days.reduce((sum, d) => sum + (section === "Strength" ? d.strength_volume : d.cardio_sessions), 0))}</td></tr>)}</tbody></table></div>
        {fields.map(f => <section className="chart-panel" key={f.key}><div className="metric-heading"><h2>Weekly {f.label.toLowerCase()}</h2><span>{targets[f.key] == null ? "No target set" : `Goal: ${fmt(targets[f.key]!)} ${f.unit}/week`}</span></div><MetricChart points={[...weeks].map(([week, days]) => ({ date: week, value: actual(days, f.key) }))} label={f.label.toLowerCase()} unit={f.unit} tone="green" formatValue={fmt} target={targets[f.key]} emptyMessage="Log training to see progress." /></section>)}
      </>}
    </>}
    <footer className="target-footer"><span>Baseline</span><span>By Nich</span></footer>
  </main>;
}
