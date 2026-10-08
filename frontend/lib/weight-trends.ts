import type { BodyWeightRecord } from "./types";

export type WeightPoint = BodyWeightRecord & { average?: number };

const DAY_MS = 86_400_000;

function dayNumber(date: string) {
  return new Date(`${date}T00:00:00Z`).getTime() / DAY_MS;
}

export const TREND_WINDOW_DAYS = 14;
export const MIN_TREND_WEIGH_INS = 7;
export const MIN_TREND_SPAN_DAYS = 10;

type WeightTrend = {
  latestAverage: number | null;
  trendWeight: number | null;
  weeklyRate: number | null;
  projectedDate: Date | null;
  status: "no-goal" | "insufficient-data" | "at-goal" | "steady" | "toward-goal" | "away-from-goal";
};

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function withMovingAverage(
  records: BodyWeightRecord[],
  windowSize = 7,
): WeightPoint[] {
  return records.map((record, index) => {
    if (index < windowSize - 1) return record;
    const window = records.slice(index - windowSize + 1, index + 1);
    return {
      ...record,
      average: window.reduce((sum, item) => sum + item.weight, 0) / window.length,
    };
  });
}

export function calculateWeightTrend(
  records: BodyWeightRecord[],
  goal: number | null,
  today = localToday(),
): WeightTrend {
  const history = records
    .filter((record) => record.logged_on <= today)
    .sort((left, right) => left.logged_on.localeCompare(right.logged_on));
  const latestAverage = withMovingAverage(history).at(-1)?.average ?? null;
  const cutoff = dayNumber(today) - TREND_WINDOW_DAYS + 1;
  const recent = history.filter((record) => dayNumber(record.logged_on) >= cutoff);
  const result: WeightTrend = {
    latestAverage,
    trendWeight: null,
    weeklyRate: null,
    projectedDate: null,
    status: goal === null ? "no-goal" : "insufficient-data",
  };

  // Require measurements on at least seven days spanning ten calendar days.
  if (recent.length < MIN_TREND_WEIGH_INS
    || dayNumber(recent.at(-1)!.logged_on) - dayNumber(recent[0].logged_on) < MIN_TREND_SPAN_DAYS - 1) {
    return result;
  }

  const origin = dayNumber(recent[0].logged_on);
  const samples = recent.map((point) => ({
    x: dayNumber(point.logged_on) - origin,
    y: point.weight,
  }));
  const meanX = samples.reduce((sum, point) => sum + point.x, 0) / samples.length;
  const meanY = samples.reduce((sum, point) => sum + point.y, 0) / samples.length;
  const denominator = samples.reduce(
    (sum, point) => sum + (point.x - meanX) ** 2,
    0,
  );
  const slope = denominator === 0
    ? 0
    : samples.reduce(
        (sum, point) => sum + (point.x - meanX) * (point.y - meanY),
        0,
      ) / denominator;
  // Project from the fitted weight at the latest weigh-in, so one low or high
  // measurement does not independently anchor the arrival estimate.
  const trendWeight = meanY + slope * (samples.at(-1)!.x - meanX);
  result.trendWeight = trendWeight;
  result.weeklyRate = slope * 7;

  if (goal === null) return result;

  const remaining = goal - trendWeight;
  if (Math.abs(remaining) < 0.05) {
    return { ...result, status: "at-goal" };
  }
  if (Math.abs(slope) < 0.005) {
    return { ...result, status: "steady" };
  }
  if (Math.sign(remaining) !== Math.sign(slope)) {
    return { ...result, status: "away-from-goal" };
  }

  result.status = "toward-goal";
  const daysToGoal = remaining / slope;
  if (daysToGoal <= 0 || daysToGoal > 1_825) {
    return result;
  }
  const latestDate = new Date(`${recent.at(-1)!.logged_on}T12:00:00`);
  latestDate.setDate(latestDate.getDate() + Math.ceil(daysToGoal));
  // A forecast based on older measurements must not promise a date already past.
  if (latestDate >= new Date(`${today}T00:00:00`)) result.projectedDate = latestDate;
  return result;
}
