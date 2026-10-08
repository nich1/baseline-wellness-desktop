"use client";

import { FormEvent, useState } from "react";
import { AnalysisNav } from "@/components/AnalysisNav";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { appToday, shiftCalendarDate } from "@/lib/dates";

export default function ExportPage() {
  const [endDate, setEndDate] = useState(appToday);
  const [startDate, setStartDate] = useState(() => shiftCalendarDate(appToday(), -29));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function exportData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? "download";
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const data = await api.exportHistory(startDate, endDate);
      const json = JSON.stringify(data, null, 2);
      if (action === "copy") {
        try {
          await navigator.clipboard.writeText(json);
        } catch {
          throw new Error("Could not copy to the clipboard. Use Download JSON to save the same data.");
        }
      } else {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `baseline-${startDate}-to-${endDate}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      const loggedDays = data.days.filter(day => day.bodyweight !== null || day.food_entries.length || day.training.strength_sets.length || day.training.cardio_sessions.length).length;
      setStatus(`${action === "copy" ? "Copied" : "Downloaded"} ${data.days.length} days (${startDate} through ${endDate}), with records on ${loggedDays} days.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export your data. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="export-page">
      <header className="site-header"><Brand /><AnalysisNav active="/export" /></header>
      <section className="strength-hero"><div className="page-title"><h1>Export your data</h1></div></section>
      <section className="export-panel">
        <h2>A daily record, ready to share</h2>
        <p className="target-help">Download a JSON file or copy it into a chat to discuss your nutrition, weight, and training. Both dates are included.</p>
        <form className="export-layout" onSubmit={exportData}>
          <div className="export-controls">
          <fieldset disabled={busy} className="export-range" aria-label="Export date range">
            <label className="field"><span>Start date</span><input type="date" required value={startDate} onChange={event => { setStartDate(event.target.value); setError(""); setStatus(""); }} /></label>
            <label className="field"><span>End date</span><input type="date" required min={startDate} value={endDate} onChange={event => { setEndDate(event.target.value); setError(""); setStatus(""); }} /></label>
          </fieldset>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="export-actions">
            <button className="button primary" type="submit" value="download" disabled={busy}>{busy ? "Preparing…" : "Download JSON"}</button>
            <button className="button secondary" type="submit" value="copy" disabled={busy}>Copy JSON</button>
          </div>
          <p className="export-status" role="status">{status}</p>
          </div>
          <aside className="export-contents"><h3>Included in your export</h3>
          <ul className="export-includes">
            <li>Daily weights and dates</li>
            <li>Logged foods and meals, serving sizes, and quantities</li>
            <li>Calories, macros, fiber, sugars, all tracked fats, cholesterol, sodium, and potassium—per entry and per day</li>
            <li>Strength sets with exercises, weights, and reps; cardio sessions with durations, distances, and recorded details</li>
          </ul>
          <p className="target-help">The file includes units and marks missing logs explicitly. Nutrition totals reflect what you recorded, including any incomplete days.</p>
          </aside>
        </form>
      </section>
      <footer><span>Baseline</span><span>By Nich</span></footer>
    </main>
  );
}
