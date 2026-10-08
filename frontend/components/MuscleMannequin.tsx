"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { mannequinAreas } from "@/lib/mannequin/data";
import type { MannequinScene } from "@/lib/mannequin/scene";
import { muscles, type MuscleVolume } from "@/lib/tension";
import type { ExerciseTension, LiftSet } from "@/lib/types";

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function MuscleMannequin({ groups, lifts, profiles, total, unassigned, showRegions }: {
  groups: MuscleVolume[]; lifts: LiftSet[]; profiles: ExerciseTension[];
  total: number; unassigned: number; showRegions: boolean;
}) {
  const { theme } = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<MannequinScene | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [webglHelp, setWebglHelp] = useState(false);
  const [view, setView] = useState("Front");
  const [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectorId = useId();
  const areas = useMemo(() => mannequinAreas(groups, lifts, profiles, showRegions, theme.colors), [groups, lifts, profiles, showRegions, theme.colors]);
  const selected = areas.find(area => area.id === selectedId) ?? areas.find(area => area.muscle === selectedId?.split(":")[0]);
  const current = useRef({ areas, showRegions, selected: selected?.id ?? null });

  useEffect(() => {
    current.current = { areas, showRegions, selected: selected?.id ?? null };
    engine.current?.update(areas, showRegions, selected?.id ?? null);
  }, [areas, showRegions, selected]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false, starting = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || starting) return;
      starting = true; observer.disconnect();
      setStatus("loading");
      setWebglHelp(false);
      import("@/lib/mannequin/scene").then(async ({ mountMannequin }) => {
        if (cancelled) return;
        const scene = await mountMannequin(element, setSelectedId, setView, () => setStatus("unavailable"));
        if (cancelled) { scene.dispose(); return; }
        engine.current = scene;
        scene.update(current.current.areas, current.current.showRegions, current.current.selected);
        setStatus("ready");
      }).catch(error => {
        if (!cancelled) {
          setWebglHelp(error instanceof Error && error.name === "WebGLContextError");
          setStatus("unavailable");
        }
      });
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); engine.current?.dispose(); engine.current = null; };
  }, [retry]);

  function choose(id: string) {
    setSelectedId(id || null);
    if (id) engine.current?.focus(id.split(":")[0]);
  }
  const topAreas = [...areas].filter(area => area.volume > 0).sort((a,b) => b.volume - a.volume).slice(0,3);

  return <section className="muscle-map" aria-label="Interactive muscle map" data-mode={showRegions ? "regions" : "muscles"}>
    <div className="muscle-map-stage">
      <div ref={host} className={`muscle-map-canvas${status === "unavailable" ? " is-unavailable" : ""}`} data-status={status} />
      {status !== "ready" && <div className="muscle-map-status" role="status">
        {status === "loading" ? <><span className="loader" /><strong>Preparing your muscle map…</strong></> : <>
          <strong>{webglHelp ? "WebGL is needed to display the 3D model" : "3D view is unavailable right now"}</strong>
          {webglHelp && <div className="muscle-map-webgl-help">
            <p>Your browser couldn’t start WebGL. It may be disabled or blocked for this site.</p>
            <p>In LibreWolf, open Settings, search for <b>WebGL</b>, and allow this site in <b>WebGL permissions</b>. Then try again or reload the page.</p>
          </div>}
          <p>You can still explore every muscle with the selector below.</p>
          <button className="button" onClick={() => setRetry(value => value + 1)}>Try 3D again</button>
        </>}
      </div>}
    </div>
    <div className="muscle-map-controls" aria-label="Model view controls">
      <div className="muscle-map-views"><button disabled={status !== "ready"} aria-pressed={view === "Front"} onClick={() => engine.current?.view(false)}>Front</button><button disabled={status !== "ready"} aria-pressed={view === "Back"} onClick={() => engine.current?.view(true)}>Back</button></div>
      <div className="muscle-map-camera"><button disabled={status !== "ready"} aria-label="Zoom in" onClick={() => engine.current?.zoom(.85)}>+</button><button disabled={status !== "ready"} aria-label="Zoom out" onClick={() => engine.current?.zoom(1/.85)}>−</button><button disabled={status !== "ready"} onClick={() => engine.current?.reset()}>Reset view</button></div>
    </div>
    <div className="muscle-map-legend"><span><i className="muscle-map-idle" />No assigned volume</span><span><i className="muscle-map-scale" />Faint → most worked {showRegions ? "region" : "muscle"}</span></div>
    <div className="muscle-map-inspector">
      <label htmlFor={selectorId}>Explore {showRegions ? "a muscle region" : "a muscle"}</label>
      <select id={selectorId} className="muscle-map-select" value={selected?.id ?? ""} onChange={event => choose(event.target.value)}>
        <option value="">Select on the model or choose here</option>
        {muscles.filter(([muscle]) => areas.some(area => area.muscle === muscle)).map(([muscle,label]) => <optgroup label={label} key={muscle}>{areas.filter(area => area.muscle === muscle).map(area => <option key={area.id} value={area.id}>{area.label}{area.volume > 0 ? ` · ${format(total ? area.volume / total * 100 : 0)}% of day` : " · Not worked"}</option>)}</optgroup>)}
      </select>
      {selected ? <div className="muscle-map-selection" aria-live="polite" data-area={selected.id}>
        <div className="muscle-map-selection-title"><i style={{ background: selected.volume > 0 ? selected.color : "#9ca3af" }} /><div><h4>{selected.label}</h4>{selected.region && <span>{selected.parent}</span>}</div></div>
        <div className="muscle-map-stats">
          <div><span>Allocated volume</span><strong>{format(selected.volume)}<small>lb × reps</small></strong></div>
          <div><span>Share of day</span><strong>{format(total ? selected.volume / total * 100 : 0)}<small>%</small></strong></div>
          {selected.region && <div><span>Share of {selected.parent.toLowerCase()}</span><strong>{format(selected.parentVolume ? selected.volume / selected.parentVolume * 100 : 0)}<small>%</small></strong></div>}
        </div>
        {selected.exercises.length ? <div className="muscle-map-exercises"><h5>Contributing exercises <small>lb × reps</small></h5>{selected.exercises.map(exercise => <div key={exercise.exercise}><span>{exercise.exercise}</span><strong>{format(exercise.volume)}</strong></div>)}</div> : <p className="muscle-map-no-volume">No volume assigned to this {selected.region ? "region" : "muscle"} for this day.</p>}
      </div> : <div className="muscle-map-prompt"><p>{topAreas.length ? "Start with one of your most-worked areas:" : "No assigned volume yet. The mannequin will light up as you log sets with muscle distributions."}</p><div>{topAreas.map(area => <button key={area.id} onClick={() => choose(area.id)}><i style={{ background: area.color }} />{area.label}</button>)}</div></div>}
    </div>
    {unassigned > 0 && <p className="muscle-map-note">{format(unassigned)} lb × reps is unassigned and isn’t colored on the model.</p>}
  </section>;
}
