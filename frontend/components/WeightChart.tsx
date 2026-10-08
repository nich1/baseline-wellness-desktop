"use client";

import { BodyWeightRecord } from "@/lib/types";
import { withMovingAverage } from "@/lib/weight-trends";
import { useState } from "react";
import { useChartWidth } from "@/lib/use-chart-width";

type Props = {
  records: BodyWeightRecord[];
  goal: number | null;
};

const margin = { top: 28, right: 34, bottom: 45, left: 58 };

export function WeightChart({ records, goal }: Props) {
  const { ref, width } = useChartWidth(records.length > 0);
  const height = width < 480 ? 300 : 360;
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [focusedDate, setFocusedDate] = useState<string | null>(null);

  if (!records.length) {
    return (
      <div className="weight-chart-empty">
        <span>No data</span>
        <h2>Log bodyweight to begin</h2>
        <p>Your trend line appears after seven weigh-ins.</p>
      </div>
    );
  }

  const points = withMovingAverage(records);
  const timestamps = points.map((point) =>
    new Date(`${point.logged_on}T12:00:00`).getTime(),
  );
  const weights = points.flatMap((point) =>
    point.average === undefined ? [point.weight] : [point.weight, point.average],
  );
  if (goal !== null) weights.push(goal);

  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeSpan = maxTime - minTime || 1;
  const minWeight = Math.floor(Math.min(...weights) - 2);
  const maxWeight = Math.ceil(Math.max(...weights) + 2);
  const weightSpan = maxWeight - minWeight || 1;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (date: string) =>
    margin.left +
    ((new Date(`${date}T12:00:00`).getTime() - minTime) / timeSpan) * plotWidth;
  const y = (weight: number) =>
    margin.top + ((maxWeight - weight) / weightSpan) * plotHeight;
  const line = (items: Array<{ logged_on: string; value: number }>) =>
    items.map((item, index) =>
      `${index === 0 ? "M" : "L"} ${x(item.logged_on).toFixed(1)} ${y(item.value).toFixed(1)}`,
    ).join(" ");
  const rawPath = line(points.map((point) => ({
    logged_on: point.logged_on,
    value: point.weight,
  })));
  const averagePath = line(
    points
      .filter((point) => point.average !== undefined)
      .map((point) => ({ logged_on: point.logged_on, value: point.average! })),
  );
  const gridValues = Array.from(
    { length: 5 },
    (_, index) => minWeight + (weightSpan * index) / 4,
  );
  const tickCount = Math.min(width < 480 ? 3 : 5, points.length);
  const dateTicks = Array.from({ length: tickCount }, (_, index) => {
    const tickIndex = Math.round((index * (points.length - 1)) / (tickCount - 1 || 1));
    return points[tickIndex];
  });
  const activePoint = points.find((point) => point.logged_on === (hoveredDate ?? focusedDate));
  const tooltipWidth = 180;
  const tooltipHeight = 60;
  const tooltipX = activePoint
    ? Math.max(8, Math.min(width - tooltipWidth - 8, x(activePoint.logged_on) - tooltipWidth / 2))
    : 0;
  const tooltipY = activePoint
    ? y(activePoint.weight) >= tooltipHeight + 20
      ? y(activePoint.weight) - tooltipHeight - 14
      : y(activePoint.weight) + 14
    : 0;
  const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="weight-chart-wrap">
      <div className="chart-legend">
        <span><i className="raw-key" /> Daily</span>
        <span><i className="average-key" /> 7-entry average</span>
        {goal !== null && <span><i className="goal-key" /> Goal</span>}
      </div>
      <svg
        ref={ref}
        style={{ height }}
        className="weight-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Bodyweight history and moving average chart"
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              className="chart-grid"
              x1={margin.left}
              x2={width - margin.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text className="chart-label" x={margin.left - 10} y={y(value) + 4}>
              {value.toFixed(1)}
            </text>
          </g>
        ))}
        {dateTicks.map((point) => (
          <text
            className="chart-date"
            key={point.logged_on}
            x={x(point.logged_on)}
            y={height - 17}
          >
            {new Date(`${point.logged_on}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </text>
        ))}
        {goal !== null && (
          <>
            <line
              className="goal-line"
              x1={margin.left}
              x2={width - margin.right}
              y1={y(goal)}
              y2={y(goal)}
            />
            <text className="goal-label" x={width - margin.right} y={y(goal) - 7}>
              Goal {goal} lb
            </text>
          </>
        )}
        {points.length > 1 && <path className="raw-line" d={rawPath} />}
        {averagePath && <path className="average-line" d={averagePath} />}
        {points.map((point) => (
          <g
            className="weight-point-target"
            key={point.logged_on}
            role="img"
            tabIndex={0}
            aria-label={`${formatDate(point.logged_on)}: ${point.weight.toFixed(1)} lb`}
            onPointerEnter={() => setHoveredDate(point.logged_on)}
            onPointerLeave={() => setHoveredDate(null)}
            onFocus={() => setFocusedDate(point.logged_on)}
            onBlur={() => setFocusedDate(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setHoveredDate(null);
                setFocusedDate(null);
              }
            }}
          >
            <circle className="weight-point-hit" cx={x(point.logged_on)} cy={y(point.weight)} r="12" />
            <circle
              className={`weight-point${activePoint?.logged_on === point.logged_on ? " active" : ""}`}
              cx={x(point.logged_on)}
              cy={y(point.weight)}
              r={activePoint?.logged_on === point.logged_on ? 6 : 4}
            />
          </g>
        ))}
        {activePoint && (
          <g className="weight-point-tooltip" transform={`translate(${tooltipX}, ${tooltipY})`} aria-hidden="true">
            <rect width={tooltipWidth} height={tooltipHeight} rx="8" />
            <text className="weight-tooltip-date" x="12" y="22">{formatDate(activePoint.logged_on)}</text>
            <text className="weight-tooltip-value" x="12" y="45">{activePoint.weight.toFixed(1)} lb</text>
          </g>
        )}
      </svg>
    </div>
  );
}
