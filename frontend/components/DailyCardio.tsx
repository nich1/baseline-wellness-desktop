"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { CardioSession, DistanceUnit } from "@/lib/types";

type Props = { date: string };

const activities = [
  "Run",
  "Walk",
  "Cycling",
  "Swimming",
  "Rowing",
  "Elliptical",
  "Stair climber",
  "Other",
];

const milesPerUnit: Record<DistanceUnit, number> = {
  mi: 1,
  km: 0.621371,
  m: 0.000621371,
  yd: 1 / 1760,
};

function number(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function clockFromMinutes(minutes: number) {
  const seconds = Math.round(minutes * 60);
  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${remainingMinutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function performance(session: CardioSession) {
  if (!session.distance) return "—";

  if (session.activity === "Cycling") {
    const miles = session.distance * milesPerUnit[session.distance_unit];
    return `${(miles / (session.duration_minutes / 60)).toFixed(1)} mph`;
  }

  if (session.activity === "Swimming") {
    const useYards = session.distance_unit === "yd";
    const unit = useYards ? "yd" : "m";
    const distance = useYards
      ? session.distance
      : (session.distance * milesPerUnit[session.distance_unit]) / milesPerUnit.m;
    return `${clockFromMinutes(session.duration_minutes / (distance / 100))} /100 ${unit}`;
  }

  const miles = session.distance * milesPerUnit[session.distance_unit];
  return `${clockFromMinutes(session.duration_minutes / miles)} /mi`;
}

export function DailyCardio({ date }: Props) {
  const [sessions, setSessions] = useState<CardioSession[]>([]);
  const [activity, setActivity] = useState("Run");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("mi");
  const [heartRate, setHeartRate] = useState("");
  const [elevation, setElevation] = useState("");
  const [effort, setEffort] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.getCardio({ loggedOn: date })
      .then((items) => {
        if (active) setSessions(items);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load cardio");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const totals = useMemo(() => {
    const sessionsWithHeartRate = sessions.filter(
      (session) => session.average_heart_rate !== null,
    );
    const heartRateMinutes = sessionsWithHeartRate.reduce(
      (sum, session) => sum + session.duration_minutes,
      0,
    );
    return {
      minutes: sessions.reduce((sum, session) => sum + session.duration_minutes, 0),
      miles: sessions.reduce(
        (sum, session) => sum + (session.distance ?? 0) * milesPerUnit[session.distance_unit],
        0,
      ),
      elevation: sessions.reduce((sum, session) => sum + (session.elevation_gain ?? 0), 0),
      heartRate: heartRateMinutes
        ? Math.round(sessionsWithHeartRate.reduce(
            (sum, session) => sum + session.average_heart_rate! * session.duration_minutes,
            0,
          ) / heartRateMinutes)
        : null,
    };
  }, [sessions]);

  async function addSession(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createCardio({
        logged_on: date,
        activity,
        duration_minutes: Number(duration),
        distance: distance ? Number(distance) : null,
        distance_unit: distanceUnit,
        average_heart_rate: heartRate ? Number(heartRate) : null,
        elevation_gain: elevation ? Number(elevation) : null,
        perceived_effort: effort ? Number(effort) : null,
        notes: notes.trim() || null,
      });
      setSessions((current) => [...current, created]);
      setDuration("");
      setDistance("");
      setHeartRate("");
      setElevation("");
      setEffort("");
      setNotes("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save cardio");
    } finally {
      setBusy(false);
    }
  }

  async function removeSession(session: CardioSession) {
    setBusy(true);
    setError("");
    try {
      await api.deleteCardio(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete cardio");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="daily-cardio">
      <div className="daily-cardio-header">
        <div>
          <h2>Daily cardio</h2>
          <p>Track endurance, intensity, and pace.</p>
        </div>
        <span>{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
      </div>

      {error && <div className="lift-error">{error}</div>}

      <form className="cardio-form" onSubmit={addSession}>
        <label className="field">
          <span>Activity</span>
          <select value={activity} onChange={(event) => setActivity(event.target.value)}>
            {activities.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Duration</span>
          <div className="input-unit">
            <input required type="number" min=".1" max="1440" step=".1" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="30" />
            <b>MIN</b>
          </div>
        </label>
        <label className="field cardio-distance-field">
          <span>Distance <small>optional</small></span>
          <div>
            <input type="number" min=".01" step=".01" value={distance} onChange={(event) => setDistance(event.target.value)} placeholder="3.1" />
            <select aria-label="Distance unit" value={distanceUnit} onChange={(event) => setDistanceUnit(event.target.value as DistanceUnit)}>
              <option value="mi">mi</option>
              <option value="km">km</option>
              <option value="m">m</option>
              <option value="yd">yd</option>
            </select>
          </div>
        </label>
        <label className="field">
          <span>Avg. heart rate <small>optional</small></span>
          <div className="input-unit">
            <input type="number" min="30" max="250" step="1" value={heartRate} onChange={(event) => setHeartRate(event.target.value)} placeholder="145" />
            <b>BPM</b>
          </div>
        </label>
        <label className="field">
          <span>Elevation gain <small>optional</small></span>
          <div className="input-unit">
            <input type="number" min="0" step="1" value={elevation} onChange={(event) => setElevation(event.target.value)} placeholder="250" />
            <b>FT</b>
          </div>
        </label>
        <label className="field">
          <span>Effort <small>optional</small></span>
          <select value={effort} onChange={(event) => setEffort(event.target.value)}>
            <option value="">RPE 1–10</option>
            {Array.from({ length: 10 }, (_, index) => (
              <option key={index + 1} value={index + 1}>{index + 1}</option>
            ))}
          </select>
        </label>
        <label className="field cardio-notes-field">
          <span>Notes <small>optional</small></span>
          <input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Intervals, route, conditions…" />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving..." : "+ Add session"}
        </button>
      </form>

      <div className="cardio-content">
        {loading ? (
          <div className="cardio-empty"><span className="loader" /> Loading cardio...</div>
        ) : sessions.length === 0 ? (
          <div className="cardio-empty">
            <strong>No cardio logged</strong>
            <span>Add a session above to start today&apos;s endurance log.</span>
          </div>
        ) : (
          <div className="cardio-list">
            {sessions.map((session, index) => (
              <article key={session.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{session.activity}</strong>
                  <small>{session.notes || "SESSION"}</small>
                </div>
                <div><strong>{clockFromMinutes(session.duration_minutes)}</strong><small>DURATION</small></div>
                <div>
                  <strong>{session.distance ? `${number(session.distance)} ${session.distance_unit}` : "—"}</strong>
                  <small>DISTANCE</small>
                </div>
                <div><strong>{performance(session)}</strong><small>PACE / SPEED</small></div>
                <div>
                  <strong>{session.average_heart_rate ? `${session.average_heart_rate} bpm` : "—"}</strong>
                  <small>{session.perceived_effort ? `RPE ${session.perceived_effort}` : "AVG HR"}</small>
                </div>
                <button disabled={busy} onClick={() => removeSession(session)} aria-label={`Delete ${session.activity} session`}>×</button>
              </article>
            ))}
          </div>
        )}
        <aside className="cardio-summary">
          <div><span>TIME</span><strong>{clockFromMinutes(totals.minutes)}</strong></div>
          <div><span>DISTANCE</span><strong>{number(totals.miles)}<small>MI</small></strong></div>
          <div><span>AVG HR</span><strong>{totals.heartRate ?? "—"}<small>{totals.heartRate ? "BPM" : ""}</small></strong></div>
          <div><span>ELEVATION</span><strong>{number(totals.elevation)}<small>FT</small></strong></div>
        </aside>
      </div>
    </section>
  );
}
