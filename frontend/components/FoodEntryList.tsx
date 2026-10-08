"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { FoodEntry } from "@/lib/types";

const formatNumber = (value: number) => Number.isInteger(value) ? value.toString() : value.toFixed(1);

export function FoodEntryList({ entries, busy, onEdit, onDelete, onReorder }: {
  entries: FoodEntry[];
  busy: boolean;
  onEdit: (entry: FoodEntry) => void;
  onDelete: (entry: FoodEntry) => void;
  onReorder: (ids: number[]) => Promise<void>;
}) {
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; pointer: number; startY: number; y: number; offset: number; lastWorldY: number; lastSwapY: number; moved: boolean; ids: number[] } | null>(null);
  const frame = useRef(0);
  const previousTops = useRef(new Map<number, number>());
  const saving = useRef(false);
  const pendingFocus = useRef<number | null>(null);
  const [preview, setPreview] = useState<number[] | null>(null);
  const [grabbed, setGrabbed] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hintId = useId();
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const ordered = preview ? preview.map(id => byId.get(id)).filter((entry): entry is FoodEntry => !!entry) : entries;

  const capturePositions = useCallback(() => {
    previousTops.current = new Map([...list.current?.querySelectorAll<HTMLElement>(".food-row") ?? []]
      .map(row => [Number(row.dataset.entryId), row.getBoundingClientRect().top]));
  }, []);

  const cancel = useCallback(() => {
    capturePositions();
    drag.current = null;
    cancelAnimationFrame(frame.current);
    setPreview(null);
    setGrabbed(null);
  }, [capturePositions]);


  function followPointer() {
    const current = drag.current, container = list.current;
    if (!current || !container) return;
    const row = container.querySelector<HTMLElement>(`[data-entry-id="${current.id}"]`);
    if (!row) return;
    const bounds = container.getBoundingClientRect();
    const top = Math.max(0, Math.min(container.clientHeight - row.offsetHeight, current.y - current.offset - bounds.top));
    row.style.transform = `translateY(${top - row.offsetTop}px)`;
  }

  // Animate from the previous painted positions to the new layout. The held row
  // follows the pointer directly, independently of its changing place in the list.
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.current?.querySelectorAll<HTMLElement>(".food-row").forEach(row => {
      const id = Number(row.dataset.entryId);
      row.getAnimations().forEach(animation => animation.cancel());
      row.style.transform = "";
      if (id === drag.current?.id) return;
      const previous = previousTops.current.get(id);
      if (previous === undefined || reducedMotion) return;
      const delta = previous - row.getBoundingClientRect().top;
      if (Math.abs(delta) > .5) row.animate([
        { transform: `translateY(${delta}px)` }, { transform: "translateY(0)" },
      ], { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    followPointer();
    previousTops.current.clear();
  }, [preview, grabbed, entries]);

  useLayoutEffect(() => {
    if (busy || pendingFocus.current === null) return;
    list.current?.querySelector<HTMLButtonElement>(`[data-reorder-id="${pendingFocus.current}"]`)?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [busy, preview, entries]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        const id = drag.current.id;
        cancel();
        setMessage("Reordering cancelled.");
        list.current?.querySelector<HTMLButtonElement>(`[data-reorder-id="${id}"]`)?.focus();
      }
    };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); cancelAnimationFrame(frame.current); };
  }, [cancel]);

  async function commit(ids: number[], id: number) {
    if (saving.current || ids.every((value, index) => value === entries[index]?.id)) {
      setPreview(null);
      return;
    }
    saving.current = true;
    if (!previousTops.current.size) capturePositions();
    setPreview(ids);
    setError("");
    setMessage("Saving order…");
    try {
      await onReorder(ids);
      setMessage(`${byId.get(id)?.name} moved to position ${ids.indexOf(id) + 1} of ${ids.length}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the order. Try again.");
      setMessage("");
    } finally {
      saving.current = false;
      capturePositions();
      pendingFocus.current = id;
      setPreview(null);
    }
  }

  function moveToPointer() {
    const current = drag.current, container = list.current;
    if (!current || !current.moved || !container) return;
    followPointer();
    const worldY = current.y + window.scrollY;
    const direction = Math.sign(worldY - current.lastWorldY);
    current.lastWorldY = worldY;
    if (!direction || Math.abs(worldY - current.lastSwapY) < 16) return;
    const rows = [...container.querySelectorAll<HTMLElement>(".food-row")];
    const index = rows.findIndex(row => Number(row.dataset.entryId) === current.id);
    const bounds = container.getBoundingClientRect();
    const top = current.y - current.offset - bounds.top;
    const bottom = top + rows[index].offsetHeight;
    let target = index;
    // Use the leading edge of the dragged row, not the pointer's position at the
    // handle. Test stable layout slots so sliding animations cannot cause jitter.
    while (rows[target + direction]) {
      const neighbor = rows[target + direction];
      const threshold = Math.min(32, neighbor.offsetHeight * .25);
      const crossed = direction > 0 ? bottom > neighbor.offsetTop + threshold
        : top < neighbor.offsetTop + neighbor.offsetHeight - threshold;
      if (!crossed) break;
      target += direction;
    }
    if (target !== index) {
      const next = rows.map(row => Number(row.dataset.entryId));
      next.splice(index, 1);
      next.splice(target, 0, current.id);
      capturePositions();
      current.ids = next;
      current.lastSwapY = worldY;
      setPreview(next);
    }
  }

  function autoScroll() {
    const current = drag.current;
    if (!current) return;
    if (current.moved) {
      const edge = 64;
      const delta = current.y < edge ? -Math.min(16, (edge - current.y) / 4)
        : current.y > innerHeight - edge ? Math.min(16, (current.y - innerHeight + edge) / 4) : 0;
      if (delta) { window.scrollBy(0, delta); moveToPointer(); }
    }
    frame.current = requestAnimationFrame(autoScroll);
  }

  function start(event: PointerEvent<HTMLButtonElement>, id: number) {
    if (busy || saving.current || entries.length < 2 || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    list.current?.setPointerCapture(event.pointerId);
    const row = event.currentTarget.closest<HTMLElement>(".food-row")!;
    const worldY = event.clientY + window.scrollY;
    drag.current = { id, pointer: event.pointerId, startY: event.clientY, y: event.clientY,
      offset: event.clientY - row.getBoundingClientRect().top, lastWorldY: worldY, lastSwapY: worldY,
      moved: false, ids: entries.map(entry => entry.id) };
    setGrabbed(id);
    setError("");
    frame.current = requestAnimationFrame(autoScroll);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    drag.current.y = event.clientY;
    drag.current.moved ||= Math.abs(event.clientY - drag.current.startY) > 3;
    moveToPointer();
  }

  function drop(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    capturePositions();
    drag.current = null;
    cancelAnimationFrame(frame.current);
    setGrabbed(null);
    if (current.moved) void commit(current.ids, current.id);
    else setPreview(null);
  }

  return <>
    <p id={hintId} className="food-reorder-status">Drag to reorder. With a handle focused, use the up or down arrow keys. Escape cancels dragging.</p>
    <div className="food-reorder-status" role="status">{message}</div>
    {error && <p className="food-reorder-error" role="alert">{error}</p>}
    <div ref={list} className="entry-list" aria-busy={busy} onPointerMove={move} onPointerUp={drop} onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel(); }}>
      {ordered.map(entry => <article className={`food-row${grabbed === entry.id ? " is-dragging" : ""}`} key={entry.id} data-entry-id={entry.id}>
        <div className="food-main">
          <div className="food-title">
            <button className="food-drag-handle" type="button" data-reorder-id={entry.id}
              disabled={busy || entries.length < 2} aria-label={`Reorder ${entry.name}`} aria-describedby={hintId}
              title="Drag to reorder · ↑ / ↓ to move" onPointerDown={event => start(event, entry.id)}
              onKeyDown={event => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                if (busy || saving.current || drag.current) return;
                const ids = entries.map(item => item.id), index = ids.indexOf(entry.id);
                const target = index + (event.key === "ArrowUp" ? -1 : 1);
                if (target < 0 || target >= ids.length) return;
                [ids[index], ids[target]] = [ids[target], ids[index]];
                void commit(ids, entry.id);
              }}>
              <svg aria-hidden="true" width="16" height="20" viewBox="0 0 16 20" fill="currentColor">{[5, 10, 15].flatMap(y => [5, 11].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />))}</svg>
            </button>
            <h3>{entry.name}</h3>
          </div>
          <p>{entry.quantity !== 1 && `${formatNumber(entry.quantity)} × `}{entry.serving || "Serving not specified"}</p>
          <div className="food-details">
            {entry.carbohydrates > 0 && <span>CARB {formatNumber(entry.carbohydrates)}g</span>}
            {entry.fat > 0 && <span>FAT {formatNumber(entry.fat)}g</span>}
            {entry.fiber > 0 && <span>FIBER {formatNumber(entry.fiber)}g</span>}
            {entry.sodium > 0 && <span>NA {formatNumber(entry.sodium)}mg</span>}
          </div>
        </div>
        <div className="food-macro calories-value"><strong>{formatNumber(entry.calories)}</strong><span>KCAL</span></div>
        <div className="food-macro protein-value"><strong>{formatNumber(entry.protein)}g</strong><span>PROTEIN</span></div>
        <div className="row-actions">
          <button disabled={busy || grabbed !== null} onClick={() => onEdit(entry)} aria-label={`Edit ${entry.name}`}>Edit</button>
          <button disabled={busy || grabbed !== null} onClick={() => onDelete(entry)} aria-label={`Delete ${entry.name}`}>×</button>
        </div>
      </article>)}
    </div>
  </>;
}
