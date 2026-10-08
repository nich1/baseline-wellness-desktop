"use client";
import Link from "next/link";
import { useEffect, useState, FormEvent } from "react";
import { SettingsButton } from "@/components/SettingsButton";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api";
import { targetFields } from "@/lib/targets";
import type { NutritionTargets } from "@/lib/types";

export default function TargetsPage() {
  const [form, setForm] = useState<Partial<Record<keyof NutritionTargets, string>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { let active = true; api.getTargets().then(data => {
    if (active) setForm(Object.fromEntries(targetFields.map(f => [f.key, data[f.key]?.toString() ?? ""])));
  }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!form) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      await api.updateTargets(Object.fromEntries(targetFields.map(f => [f.key, form[f.key] === "" ? null : Number(form[f.key])])) as NutritionTargets);
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save targets"); }
    finally { setBusy(false); }
  }
  return <main className="targets-page">
    <header className="site-header"><Brand /><nav className="analysis-nav"><Link href="/trends/targets">Target progress</Link><Link href="/export">Export</Link><Link href="/">Daily log</Link><SettingsButton /></nav></header>
    <section className="strength-hero"><div className="page-title"><h1>Your targets</h1></div></section>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!form ? <p>{error ? "Reload this page to try again." : "Loading targets…"}</p> : <form className="target-settings-layout" onSubmit={save}>
      <p className="target-help">Optional fields can be left blank to turn them off. Limits are ceilings; minimums are goals to reach. Budgets show how much you have used.</p>
      {(["Nutrition", "Strength", "Cardio"] as const).map(group => <section className={`target-settings target-settings-${group.toLowerCase()}`} key={group}>
        <div className="metric-heading"><h2>{group}</h2><span>{group === "Nutrition" ? "Per day" : "Per week · Monday–Sunday"}</span></div>
        <div className="target-fields expanded-target-fields">{targetFields.filter(f => f.group === group).map(f => <label className="field" key={f.key}>
          <span>{f.label} · {f.kind}{!f.required && " (optional)"}</span>
          <div className="input-unit"><input type="number" required={f.required} min={f.kind === "limit" ? 0 : f.unit === "days" || f.unit === "sets" ? 1 : 0.1} max={f.max} step={f.unit === "days" || f.unit === "sets" ? 1 : "any"} value={form[f.key] ?? ""} disabled={busy} placeholder="Not set" onChange={e => { setForm({ ...form, [f.key]: e.target.value }); setSaved(false); }} /><b>{f.unit}</b></div>
        </label>)}</div>
      </section>)}
      <div className="target-save"><span role="status">{saved ? "Targets saved." : ""}</span><Link href="/trends/targets">View progress</Link><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save targets"}</button></div>
    </form>}
    <footer><span>Baseline</span><span>By Nich</span></footer>
  </main>;
}
