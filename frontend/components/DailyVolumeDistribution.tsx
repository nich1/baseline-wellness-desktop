"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { distributeVolume, flattenMuscleVolumes, muscles } from "@/lib/tension";
import { ExerciseTension, LiftSet } from "@/lib/types";

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const percentage = (value: number, total: number) => total ? value / total * 100 : 0;
const info = (id: string) => {
  const [key, label, color] = muscles.find(([key]) => key === id) ?? [id, id, "#a1a1aa"];
  return [key, label, `var(--muscle-${key}, ${color})`];
};
const MuscleMannequin = dynamic(() => import("./MuscleMannequin"), { ssr: false });

export function DailyVolumeDistribution({ date, lifts, loadingLifts, liftError }: {
  date: string; lifts: LiftSet[]; loadingLifts: boolean; liftError: string;
}) {
  const [showRegions, setShowRegions] = useState(false);
  const [profiles, setProfiles] = useState<ExerciseTension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    function refresh() {
      const id = ++requestId;
      api.getExerciseTensions().then((data) => {
        if (active && id === requestId) { setProfiles(data); setError(""); }
      }).catch(() => {
        if (active && id === requestId) setError("Could not load muscle distributions.");
      }).finally(() => { if (active && id === requestId) setLoading(false); });
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [retry]);

  const distribution = useMemo(() => distributeVolume(lifts, profiles), [lifts, profiles]);
  const { total, groups, unassigned, missing } = distribution;
  const regionRows = useMemo(() => flattenMuscleVolumes(groups), [groups]);
  const chartRows = showRegions ? regionRows : groups.map((group) => ({
    id: group.muscle, muscle: group.muscle, label: info(group.muscle)[1], volume: group.volume, color: info(group.muscle)[2],
  }));
  const ready = !loading && !loadingLifts && !error && !liftError;
  return <section className="volume-distribution" aria-labelledby="volume-distribution-title" aria-busy={loading || loadingLifts}>
    <div className="volume-distribution-heading">
      <div><span className="tension-eyebrow">YOUR WORKOUT, BY MUSCLE</span><h2 id="volume-distribution-title">Volume distribution</h2><p>Where your logged volume went · <time dateTime={date}>{date}</time></p></div>
      <Link href="/strength">Edit distributions ↗</Link>
    </div>
    <div className="volume-distribution-body">
    <div className="volume-breakdown">
    {!ready ? <div className="volume-message">
      {liftError ? <p role="alert">Could not load this day&apos;s sets. Refresh the page to try again.</p>
        : error ? <><p role="alert">{error}</p><button className="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>Retry</button></>
        : <p><span className="loader" /> Loading volume distribution…</p>}
    </div> : !lifts.length ? <div className="volume-message"><strong>No volume logged for this day</strong><p>Log a set in Daily lifts to see which muscles you worked.</p></div> : <>
      <div className="volume-overview">
        <div><span>Total volume</span><strong data-testid="distributed-total">{format(total)}<small>LB × REPS</small></strong></div>
        <div><span>Muscle groups</span><strong>{groups.length}</strong></div>
        <div><span>Volume assigned</span><strong>{format(percentage(total - unassigned, total))}<small>%</small></strong></div>
      </div>
      <div className="volume-view-control">
        <label><input type="checkbox" checked={showRegions} onChange={(event) => setShowRegions(event.target.checked)} aria-describedby="volume-view-hint" />Show muscle regions</label>
        <p id="volume-view-hint">{showRegions ? "Grouped by muscle · Headers show muscle totals; each region shows its share of the day and its parent muscle." : "See individual heads and regions together in the chart."}</p>
      </div>
      <div className="volume-stack" role="img" aria-label={chartRows.map((row) => `${row.label} ${format(percentage(row.volume, total))}%`).concat(unassigned ? [`Unassigned ${format(percentage(unassigned, total))}%`] : []).join(", ")}>
        {chartRows.filter((row) => row.volume > 0).map((row, index, visible) => <span className={index > 0 && visible[index - 1].muscle !== row.muscle ? "volume-stack-group-start" : ""} key={row.id} style={{ width: `${percentage(row.volume, total)}%`, background: row.color }} title={`${row.label}: ${format(row.volume)} lb × reps (${format(percentage(row.volume, total))}% of day)`} />)}
        {unassigned > 0 && <span className="volume-unassigned-segment" style={{ width: `${percentage(unassigned, total)}%` }} />}
      </div>
      <div className="volume-column-labels"><span>{showRegions ? "Muscle heads & regions" : "Muscle · expand for details"}</span><span>Volume / share of day</span></div>
      {showRegions ? <div className="volume-region-list">
        {groups.map((group) => {
          const [, label, color] = info(group.muscle);
          return <section className="volume-region-group" key={group.muscle} data-muscle-group={group.muscle} aria-label={`${label} volume distribution`} style={{ borderLeftColor: color }}>
            <div className="volume-region-group-heading" style={{ background: `color-mix(in srgb, ${color} 7%, var(--surface-raised))` }}>
              <div><h3>{label}</h3><span>Muscle total · lb × reps</span></div>
              <span className="volume-track"><span style={{ width: `${percentage(group.volume, total)}%`, background: color }} /></span>
              <span className="volume-amount"><strong>{format(group.volume)}</strong><small>{format(percentage(group.volume, total))}% of day</small></span>
            </div>
            {group.regions.length > 0 && <div className="volume-region-group-rows">
              {regionRows.filter((row) => row.muscle === group.muscle).map((row) => <div className="volume-region-row" key={row.id} data-region={row.id}>
                <span className="volume-region-name"><i style={{ background: row.color }} /><span>{row.label}<small>{format(row.parentPercent)}% of {row.parent.toLowerCase()}</small></span></span>
                <span className="volume-track"><span style={{ width: `${percentage(row.volume, total)}%`, background: row.color }} /></span>
                <span className="volume-amount"><strong>{format(row.volume)}</strong><small>{format(percentage(row.volume, total))}%</small></span>
              </div>)}
            </div>}
          </section>;
        })}
      </div> :
      <div className="volume-muscles">
        {groups.map((group) => {
          const [, label, color] = info(group.muscle);
          return <details key={group.muscle} className="volume-muscle" data-muscle={group.muscle}>
            <summary>
              <span className="volume-muscle-name"><i style={{ background: color }} />{label}<b>⌄</b></span>
              <span className="volume-track"><span style={{ width: `${percentage(group.volume, total)}%`, background: color }} /></span>
              <span className="volume-amount"><strong>{format(group.volume)}</strong><small>{format(percentage(group.volume, total))}%</small></span>
            </summary>
            <div className="volume-detail">
              {group.regions.length > 0 && <div><h3>Heads & regions <small>% of {label.toLowerCase()}</small></h3>
                {group.regions.filter((region) => region.volume > 0).map((region) => <div className="volume-detail-row" key={region.id}><span>{region.label}</span><strong>{format(region.volume)}<small>{format(percentage(region.volume, group.volume))}%</small></strong></div>)}
              </div>}
              <div><h3>Contributing exercises</h3>{group.exercises.map((exercise) => <div className="volume-detail-row" key={exercise.exercise}><span>{exercise.exercise}</span><strong>{format(exercise.volume)}</strong></div>)}</div>
            </div>
          </details>;
        })}
      </div>
      }
      {unassigned > 0 && <div className="volume-unassigned"><strong>Unassigned volume · {format(unassigned)} lb × reps ({format(percentage(unassigned, total))}%)</strong><p>Set or complete distributions for: {missing.map((item) => item.exercise).join(", ")}.</p><Link href="/strength">Set up muscle distributions ↗</Link></div>}
      <p className="volume-formula">Each set&apos;s weight × reps × muscle share. Region shares apply within each muscle. Uses your current saved distributions, including for past days. Values are rounded for display.</p>
    </>}
    </div>
    {ready && lifts.length > 0 && <MuscleMannequin key={date} groups={groups} lifts={lifts} profiles={profiles} total={total} unassigned={unassigned} showRegions={showRegions} />}
    </div>
  </section>;
}
