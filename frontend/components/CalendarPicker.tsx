"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { appToday } from "@/lib/dates";

type Props = {
  label: string;
  selectedDate: string;
  onSelect: (date: string) => void;
};

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthString(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function CalendarPicker({ label, selectedDate, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(selectedDate.slice(0, 7));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const month = useMemo(() => {
    const first = new Date(`${visibleMonth}-01T00:00:00Z`);
    const gridStart = new Date(first);
    gridStart.setUTCDate(1 - first.getUTCDay());

    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setUTCDate(gridStart.getUTCDate() + index);
      return dateString(date);
    });

    return {
      days,
      name: first.toLocaleDateString(undefined, {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }),
    };
  }, [visibleMonth]);

  function shiftMonth(amount: number) {
    const date = new Date(`${visibleMonth}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + amount);
    setVisibleMonth(monthString(date));
  }

  return (
    <div className="date-picker" ref={rootRef}>
      <button
        className="date-picker-trigger"
        type="button"
        aria-label={`Choose log date, currently ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{label}</strong>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="calendar-popover" role="dialog" aria-label="Choose log date">
          <div className="calendar-header">
            <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>←</button>
            <strong>{month.name}</strong>
            <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>→</button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {month.days.map((day) => (
              <button
                className={[
                  day.slice(0, 7) !== visibleMonth ? "outside-month" : "",
                  day === selectedDate ? "selected" : "",
                  day === appToday() ? "today" : "",
                ].filter(Boolean).join(" ")}
                type="button"
                key={day}
                aria-label={day}
                aria-pressed={day === selectedDate}
                onClick={() => {
                  onSelect(day);
                  setOpen(false);
                }}
              >
                {Number(day.slice(-2))}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
