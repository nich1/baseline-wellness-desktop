"use client";

import { useState } from "react";
import { useChartWidth } from "@/lib/use-chart-width";
import { nutritionDate, nutritionNumber, type NutritionDay, type NutritionMetric } from "@/lib/nutrition-trends";

export type NutritionSeries = { key: NutritionMetric; label: string; color: string };

export function NutritionWeekChart({ days, series, unit, label, target }: {
  days: NutritionDay[];
  series: NutritionSeries[];
  unit: string;
  label: string;
  target?: number | null;
}) {
  const { ref, width } = useChartWidth(true);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const height = 280;
  const margin = { top: 30, right: 16, bottom: 48, left: width < 400 ? 44 : 58 };
  const plotHeight = height - margin.top - margin.bottom;
  const totals = days.map(day => day.nutrients ? series.reduce((sum, s) => sum + day.nutrients![s.key], 0) : 0);
  const max = Math.max(1, ...totals, target ?? 0);
  const step = 10 ** Math.floor(Math.log10(max));
  const ceiling = Math.ceil(max * 1.15 / step) * step;
  const y = (value: number) => height - margin.bottom - value / ceiling * plotHeight;
  const slotWidth = (width - margin.left - margin.right) / 7;
  const barWidth = Math.min(44, slotWidth * .55);
  const activeDay = days.find(day => day.date === activeDate);
  const description = (day: NutritionDay) => day.nutrients
    ? series.map(s => `${s.label}: ${nutritionNumber(day.nutrients![s.key])} ${unit}`).join(" · ")
    : day.status === "future" ? "Upcoming" : "Not logged";

  return <div className="nutrition-chart-body">
    <svg ref={ref} className="nutrition-week-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}>
      {[0, 1, 2, 3, 4].map(tick => {
        const value = ceiling * tick / 4;
        return <g key={tick}>
          <line className="chart-grid" x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} />
          <text className="chart-label" x={margin.left - 9} y={y(value) + 4}>{Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text>
        </g>;
      })}
      <text className="nutrition-chart-unit" x={margin.left} y="16">{unit}</text>
      {days.map((day, index) => {
        const center = margin.left + slotWidth * (index + .5);
        let sum = 0;
        return <g key={day.date} className="nutrition-chart-day" role="button" tabIndex={0}
          aria-label={`${nutritionDate(day.date, { weekday: "long", month: "short", day: "numeric" })}. ${description(day)}`}
          aria-pressed={day.date === activeDate}
          onPointerEnter={() => setActiveDate(day.date)} onFocus={() => setActiveDate(day.date)} onClick={() => setActiveDate(day.date)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveDate(day.date); }
            if (event.key === "Escape") setActiveDate(null);
          }}>
          <rect className="nutrition-chart-hit" x={center - slotWidth / 2 + 2} y={margin.top} width={Math.max(1, slotWidth - 4)} height={plotHeight + 40} rx="5" />
          {day.nutrients ? series.map(s => {
            const value = day.nutrients![s.key];
            sum += value;
            return <rect key={s.key} x={center - barWidth / 2} y={y(sum)} width={barWidth} height={value / ceiling * plotHeight} fill={s.color} />;
          }) : <text className="nutrition-chart-missing" x={center} y={y(0) - 10}>{day.status === "future" ? "·" : "—"}</text>}
          {day.nutrients && totals[index] === 0 && <circle cx={center} cy={y(0)} r="3" fill={series[0].color} />}
          <text className="chart-date" x={center} y={height - 28}>{nutritionDate(day.date, { weekday: "short" })}</text>
          <text className="chart-date nutrition-chart-date" x={center} y={height - 11}>{nutritionDate(day.date, { day: "numeric" })}</text>
        </g>;
      })}
      {target != null && <g className="nutrition-chart-target">
        <line className="goal-line" x1={margin.left} x2={width - margin.right} y1={y(target)} y2={y(target)} />
      </g>}
    </svg>
    <div className="nutrition-chart-readout" aria-live="polite">
      {activeDay ? <><strong>{nutritionDate(activeDay.date, { weekday: "short", month: "short", day: "numeric" })}</strong><span>{description(activeDay)}</span></>
        : <><strong>Explore the week</strong><span>Hover, tap, or focus a day to see its totals.</span></>}
    </div>
  </div>;
}
