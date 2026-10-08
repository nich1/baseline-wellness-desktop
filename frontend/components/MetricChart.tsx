"use client";

import { useState } from "react";
import { useChartWidth } from "@/lib/use-chart-width";

type Point = { date: string; value: number; details?: string[] };

type Props = {
  points: Point[];
  label: string;
  valueLabel?: string;
  unit: string;
  tone: "orange" | "green";
  emptyMessage?: string;
  formatValue?: (value: number) => string;
  target?: number | null;
};

const margin = { top: 24, right: 30, bottom: 43, left: 64 };

export function MetricChart({
  points,
  label,
  valueLabel,
  unit,
  tone,
  emptyMessage = "Log sets for this exercise to populate the chart.",
  formatValue = (value) => Math.round(value).toLocaleString(),
  target,
}: Props) {
  const { ref, width } = useChartWidth(points.length > 0);
  const height = width < 480 ? 260 : 300;
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);

  if (!points.length) {
    return (
      <div className="metric-chart-empty">
        <strong>No {label} data</strong>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  const timestamps = points.map((point) =>
    new Date(`${point.date}T12:00:00`).getTime(),
  );
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeSpan = maxTime - minTime || 1;
  const values = points.map((point) => point.value);
  if (target != null) values.push(target);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.15, rawMax * 0.05, 1);
  const minValue = Math.max(0, rawMin - padding);
  const maxValue = rawMax + padding;
  const valueSpan = maxValue - minValue || 1;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (date: string) =>
    margin.left +
    ((new Date(`${date}T12:00:00`).getTime() - minTime) / timeSpan) * plotWidth;
  const y = (value: number) =>
    margin.top + ((maxValue - value) / valueSpan) * plotHeight;
  const path = points.map(
    (point, index) =>
      `${index === 0 ? "M" : "L"} ${x(point.date).toFixed(1)} ${y(point.value).toFixed(1)}`,
  ).join(" ");
  const area = points.length > 1
    ? `${path} L ${x(points.at(-1)!.date).toFixed(1)} ${height - margin.bottom} L ${x(points[0].date).toFixed(1)} ${height - margin.bottom} Z`
    : "";
  const gridValues = Array.from(
    { length: 4 },
    (_, index) => minValue + (valueSpan * index) / 3,
  );
  const tickCount = Math.min(width < 480 ? 3 : 5, points.length);
  const dateTicks = Array.from({ length: tickCount }, (_, index) =>
    points[Math.round((index * (points.length - 1)) / (tickCount - 1 || 1))],
  );
  const activePoint = points.find((point) => point.date === (hoveredDate ?? focusedDate));
  const tooltipWidth = Math.min(310, width - 16);
  const tooltipHeight = 62 + (activePoint?.details?.length ?? 0) * 22;
  const tooltipX = activePoint
    ? Math.max(8, Math.min(width - tooltipWidth - 8, x(activePoint.date) - tooltipWidth / 2))
    : 0;
  const tooltipY = activePoint
    ? Math.max(8, Math.min(height - tooltipHeight - 8,
        y(activePoint.value) >= tooltipHeight + 20
          ? y(activePoint.value) - tooltipHeight - 14
          : y(activePoint.value) + 14))
    : 0;
  const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const pointValue = (point: Point) => `${valueLabel ? `${valueLabel}: ` : ""}${formatValue(point.value)} ${unit}`;

  return (
    <svg
      ref={ref}
      style={{ height }}
      className={`metric-chart ${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={`${label} by workout date`}
    >
      {gridValues.map((value) => (
        <g key={value}>
          <line className="chart-grid" x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} />
          <text className="chart-label" x={margin.left - 10} y={y(value) + 4}>
            {formatValue(value)}
          </text>
        </g>
      ))}
      {dateTicks.map((point) => (
        <text className="chart-date" key={point.date} x={x(point.date)} y={height - 15}>
          {new Date(`${point.date}T12:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </text>
      ))}
      {area && <path className="metric-area" d={area} />}
      {target != null && <g><line className="goal-line" x1={margin.left} x2={width - margin.right} y1={y(target)} y2={y(target)} /><text className="goal-label" x={width - margin.right} y={y(target) - 7}>Target {formatValue(target)} {unit}</text></g>}
      {points.length > 1 && <path className="metric-line" d={path} />}
      {points.map((point) => (
        <g
          className="metric-point-target"
          key={point.date}
          role="img"
          tabIndex={0}
          aria-label={[formatDate(point.date), pointValue(point), ...(point.details ?? [])].join(". ")}
          onPointerEnter={() => setHoveredDate(point.date)}
          onPointerLeave={() => setHoveredDate(null)}
          onFocus={() => setFocusedDate(point.date)}
          onBlur={() => setFocusedDate(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setHoveredDate(null);
              setFocusedDate(null);
            }
          }}
        >
          <circle className="metric-point-hit" cx={x(point.date)} cy={y(point.value)} r="12" />
          <circle
            className={`metric-point${activePoint?.date === point.date ? " active" : ""}`}
            cx={x(point.date)}
            cy={y(point.value)}
            r={activePoint?.date === point.date ? 6 : 4}
          />
        </g>
      ))}
      {activePoint && (
        <g className="metric-point-tooltip" transform={`translate(${tooltipX}, ${tooltipY})`} aria-hidden="true">
          <rect width={tooltipWidth} height={tooltipHeight} rx="8" />
          <text className="metric-tooltip-date" x="12" y="22">{formatDate(activePoint.date)}</text>
          <text className="metric-tooltip-value" x="12" y="45">{pointValue(activePoint)}</text>
          {activePoint.details?.map((detail, index) => (
            <text className="metric-tooltip-detail" key={index} x="12" y={67 + index * 22}>{detail}</text>
          ))}
        </g>
      )}
    </svg>
  );
}
