"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BodyweightControl } from "@/components/BodyweightControl";
import { SettingsButton } from "@/components/SettingsButton";
import { Brand } from "@/components/Brand";
import { CalendarPicker } from "@/components/CalendarPicker";
import { DailyCardio } from "@/components/DailyCardio";
import { DailyVolume } from "@/components/DailyVolume";
import { DailyLifts } from "@/components/DailyLifts";
import { FoodEntryList } from "@/components/FoodEntryList";
import { EntryForm } from "@/components/EntryForm";
import { LibraryPanel } from "@/components/LibraryPanel";
import { api } from "@/lib/api";
import { appToday, formatCalendarDate, shiftCalendarDate } from "@/lib/dates";
import {
  DailyLog,
  EntryPayload,
  FoodEntry,
  NutritionTargets,
  LogCategory,
} from "@/lib/types";

const defaultTargets = { calories: 2200, protein: 160, carbohydrates: 250, fat: 75 };

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(appToday);
  const [tracker, setTracker] = useState<LogCategory | "volume">("food");
  const [log, setLog] = useState<DailyLog | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [weightSaving, setWeightSaving] = useState(false);
  const [targets, setTargets] = useState<NutritionTargets>(defaultTargets);
  const [copying, setCopying] = useState(false);
  const copyInFlight = useRef(false);
  const [copyFeedback, setCopyFeedback] = useState<{ message: string; error?: boolean; targetDate?: string } | null>(null);
  const [copyRefresh, setCopyRefresh] = useState({ date: "", version: 0 });
  const refreshVersion = selectedDate === copyRefresh.date ? copyRefresh.version : 0;

  const loadLog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLog(await api.getDay(selectedDate));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load log");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    let active = true;
    api.getDay(selectedDate)
      .then((data) => {
        if (active) setLog(data);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load log");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate, refreshVersion]);

  useEffect(() => {
    let active = true;
    api.getTargets()
      .then((data) => {
        if (active) setTargets(data);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not load targets");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function selectDate(date: string) {
    setLoading(true);
    setError("");
    setEditing(null);
    setSelectedDate(date);
    setCopyFeedback(null);
  }

  function selectTracker(category: LogCategory | "volume") {
    setTracker(category);
    setCopyFeedback(null);
  }

  async function copyToToday() {
    if (tracker === "volume" || copyInFlight.current || selectedDate === appToday()) return;
    copyInFlight.current = true;
    setCopying(true);
    setCopyFeedback(null);
    try {
      const result = await api.copyToToday(selectedDate, tracker);
      const label = { food: "food entries", lifts: "lift sets", cardio: "cardio sessions" }[result.category];
      setCopyFeedback({
        message: result.copied_count
          ? `Copied ${result.copied_count} ${label} from ${formatCalendarDate(result.source_date)} to today.`
          : `No ${label} recorded on ${formatCalendarDate(result.source_date)} to copy.`,
        targetDate: result.copied_count ? result.target_date : undefined,
      });
      if (result.copied_count) {
        setCopyRefresh(current => ({ date: result.target_date, version: current.version + 1 }));
      }
    } catch (cause) {
      setCopyFeedback({ message: cause instanceof Error ? cause.message : "Could not copy records to today.", error: true });
    } finally {
      copyInFlight.current = false;
      setCopying(false);
    }
  }

  async function saveEntry(payload: EntryPayload) {
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await api.updateEntry(editing.id, payload);
        setEditing(null);
      } else {
        await api.createEntry(payload);
      }
      await loadLog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save entry");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entry: FoodEntry) {
    if (!window.confirm(`Remove “${entry.name}” from this day?`)) return;
    setError("");
    try {
      await api.deleteEntry(entry.id);
      if (editing?.id === entry.id) setEditing(null);
      await loadLog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete entry");
    }
  }


  async function saveBodyweight(weight: number) {
    setWeightSaving(true);
    setError("");
    try {
      const saved = await api.updateBodyweight(selectedDate, weight);
      setLog((current) => current ? { ...current, bodyweight: saved.weight } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save bodyweight");
    } finally {
      setWeightSaving(false);
    }
  }

  async function clearBodyweight() {
    setWeightSaving(true);
    setError("");
    try {
      await api.deleteBodyweight(selectedDate);
      setLog((current) => current ? { ...current, bodyweight: null } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear bodyweight");
    } finally {
      setWeightSaving(false);
    }
  }

  const dateLabel = useMemo(() => {
    if (selectedDate === appToday()) return "Today";
    return formatCalendarDate(selectedDate);
  }, [selectedDate]);

  const totals = log?.totals ?? {
    calories: 0,
    protein: 0,
    carbohydrates: 0,
    fiber: 0,
    sugars: 0,
    fat: 0,
    saturated_fat: 0,
    sodium: 0,
  };

  return (
    <main>
      <section className="log-toolbar" aria-label="Daily log controls">
        <div className="log-toolbar-primary">
          <Brand />
          <div className="date-control">
            <span>Log date</span>
            <div>
              <button
                type="button"
                aria-label="Previous day"
                onClick={() => selectDate(shiftCalendarDate(selectedDate, -1))}
              >
                ←
              </button>
              <CalendarPicker
                key={selectedDate}
                label={dateLabel}
                selectedDate={selectedDate}
                onSelect={selectDate}
              />
              <button
                type="button"
                aria-label="Next day"
                onClick={() => selectDate(shiftCalendarDate(selectedDate, 1))}
              >
                →
              </button>
            </div>
          </div>
        </div>

        <div className="log-toolbar-actions">
          <BodyweightControl
            key={`${selectedDate}-${loading ? "loading" : log?.bodyweight ?? "none"}`}
            value={loading ? null : log?.bodyweight ?? null}
            busy={weightSaving}
            onSave={saveBodyweight}
            onDelete={clearBodyweight}
          />
          <div className="log-toolbar-links">
            <Link className="trends-link" href="/trends">View trends</Link>
            <Link className="trends-link" href="/export">Export</Link>
            <Link className="set-targets-button" href="/targets">
              Set targets
            </Link>
            <SettingsButton />
          </div>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <span>!</span> {error}
          <button onClick={loadLog}>Retry</button>
        </div>
      )}

      <section className="macro-strip">
        {(
          [
            ["calories", "Calories", "kcal"],
            ["protein", "Protein", "g"],
            ["carbohydrates", "Carbs", "g"],
            ["fat", "Fat", "g"],
          ] as const
        ).map(([key, label, unit]) => {
          const percent = Math.min((totals[key] / targets[key]) * 100, 100);
          return (
            <article className={`macro-card ${key}`} key={key}>
              <div className="macro-label">
                <span>{label}</span>
                <small>{formatNumber(totals[key])} / {targets[key]} {unit}</small>
              </div>
              <strong>{formatNumber(totals[key])}<sup>{unit}</sup></strong>
              <div className="meter"><i style={{ width: `${percent}%` }} /></div>
              <small>{Math.round(percent)}% of target</small>
            </article>
          );
        })}
      </section>

      <div className="tracker-toolbar">
        <div className="tracker-tabs" role="tablist" aria-label="Daily tracking">
        <button
          type="button"
          role="tab"
          aria-selected={tracker === "food"}
          aria-controls="food-tracker-panel"
          className={tracker === "food" ? "active" : ""}
          onClick={() => selectTracker("food")}
        >
          Food
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tracker === "lifts"}
          aria-controls="lift-tracker-panel"
          className={tracker === "lifts" ? "active" : ""}
          onClick={() => selectTracker("lifts")}
        >
          Lifts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tracker === "volume"}
          aria-controls="volume-tracker-panel"
          className={tracker === "volume" ? "active" : ""}
          onClick={() => selectTracker("volume")}
        >
          Volume
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tracker === "cardio"}
          aria-controls="cardio-tracker-panel"
          className={tracker === "cardio" ? "active" : ""}
          onClick={() => selectTracker("cardio")}
        >
          Cardio
        </button>
        </div>
        {tracker !== "volume" && <button
          className="button secondary copy-today-button"
          type="button"
          onClick={copyToToday}
          disabled={copying || saving || selectedDate === appToday()}
          title={selectedDate === appToday() ? "Select another day to copy its records to today." : `Copy this day's ${tracker} records to today`}
        >
          {copying ? "Copying…" : "Copy To Today"}
        </button>}
      </div>
      {copyFeedback && (
        <div className={`copy-feedback${copyFeedback.error ? " copy-error" : ""}`} role={copyFeedback.error ? "alert" : "status"}>
          <span>{copyFeedback.message}</span>
          {copyFeedback.targetDate && copyFeedback.targetDate !== selectedDate && (
            <button type="button" onClick={() => selectDate(copyFeedback.targetDate!)}>View today →</button>
          )}
        </div>
      )}

      {tracker === "food" ? (
        <section
          className="workspace"
          id="food-tracker-panel"
          role="tabpanel"
          aria-label="Track food"
        >
          <EntryForm
            key={`${selectedDate}-${editing?.id ?? "new"}`}
            date={selectedDate}
            entry={editing}
            busy={saving}
            onCancel={() => setEditing(null)}
            onOpenLibrary={() => setLibraryOpen(true)}
            onSave={saveEntry}
          />

          <div className="log-panel">
            <div className="panel-heading log-heading">
              <div>
                <h2>Today&apos;s intake</h2>
              </div>
              <span>{log?.entries.length ?? 0} entries</span>
            </div>

            {loading ? (
              <div className="empty-state"><span className="loader" /> Loading log...</div>
            ) : !log?.entries.length ? (
              <div className="empty-state">
                <div className="empty-icon">+</div>
                <h3>No food logged</h3>
                <p>Add your first entry. Calories and protein are all you need.</p>
              </div>
            ) : (
              <FoodEntryList key={selectedDate} entries={log.entries} busy={saving}
                onEdit={setEditing} onDelete={deleteEntry}
                onReorder={async (ids) => {
                  const date = selectedDate;
                  setSaving(true);
                  try {
                    await api.reorderEntries(date, ids);
                    setLog(current => {
                      if (!current || current.date !== date) return current;
                      const entries = new Map(current.entries.map(entry => [entry.id, entry]));
                      return { ...current, entries: [
                        ...current.entries.filter(entry => !ids.includes(entry.id)),
                        ...ids.map(id => entries.get(id)).filter((entry): entry is FoodEntry => !!entry),
                      ] };
                    });
                  } finally { setSaving(false); }
                }} />
            )}

            <div className="micro-summary">
              <div><span>Fiber</span><strong>{formatNumber(totals.fiber)}g</strong></div>
              <div><span>Sugars</span><strong>{formatNumber(totals.sugars)}g</strong></div>
              <div><span>Sat. fat</span><strong>{formatNumber(totals.saturated_fat)}g</strong></div>
              <div><span>Sodium</span><strong>{formatNumber(totals.sodium)}mg</strong></div>
            </div>
          </div>
        </section>
      ) : tracker === "lifts" ? (
        <div
          className="tracker-panel"
          id="lift-tracker-panel"
          role="tabpanel"
          aria-label="Track lifts"
        >
          <DailyLifts key={`${selectedDate}-${refreshVersion}`} date={selectedDate} />
        </div>
      ) : tracker === "volume" ? (
        <div className="tracker-panel" id="volume-tracker-panel" role="tabpanel" aria-label="Workout volume">
          <DailyVolume key={`${selectedDate}-${refreshVersion}`} date={selectedDate} />
        </div>
      ) : (
        <div
          className="tracker-panel"
          id="cardio-tracker-panel"
          role="tabpanel"
          aria-label="Track cardio"
        >
          <DailyCardio key={`${selectedDate}-${refreshVersion}`} date={selectedDate} />
        </div>
      )}

      <footer>
        <span>Baseline</span>
        <span>By Nich</span>
      </footer>

      {libraryOpen && (
        <LibraryPanel
          date={selectedDate}
          onClose={() => setLibraryOpen(false)}
          onLogChanged={loadLog}
        />
      )}

    </main>
  );
}
