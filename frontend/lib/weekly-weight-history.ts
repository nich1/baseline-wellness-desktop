import type { BodyWeightRecord } from "./types";

export type WeeklyWeightHistoryRow = BodyWeightRecord & {
  weeklyAverage?: number;
  weeklyChangePercent?: number;
};

function dateAtUtcMidnight(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function mondayFor(value: string) {
  const date = dateAtUtcMidnight(value);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function previousMonday(value: string) {
  const date = dateAtUtcMidnight(value);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

function average(weights: number[]) {
  return weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
}

export function buildWeeklyWeightHistory(
  records: BodyWeightRecord[],
  today: string,
): WeeklyWeightHistoryRow[] {
  const weeklyWeights = new Map<string, number[]>();
  const latestWeighIn = new Map<string, string>();

  for (const record of records) {
    if (record.logged_on > today) continue;
    const week = mondayFor(record.logged_on);
    const weights = weeklyWeights.get(week) ?? [];
    weights.push(record.weight);
    weeklyWeights.set(week, weights);
    if (record.logged_on > (latestWeighIn.get(week) ?? "")) {
      latestWeighIn.set(week, record.logged_on);
    }
  }

  return [...records]
    .sort((left, right) => right.logged_on.localeCompare(left.logged_on))
    .map((record) => {
      const week = mondayFor(record.logged_on);
      if (record.logged_on !== latestWeighIn.get(week)) return record;

      const weights = weeklyWeights.get(week);
      if (!weights?.length) return record;

      const weeklyAverage = average(weights);
      const priorWeights = weeklyWeights.get(previousMonday(week));
      const priorAverage = priorWeights?.length ? average(priorWeights) : undefined;

      return {
        ...record,
        weeklyAverage,
        weeklyChangePercent: priorAverage === undefined
          ? undefined
          : ((weeklyAverage - priorAverage) / priorAverage) * 100,
      };
    });
}
