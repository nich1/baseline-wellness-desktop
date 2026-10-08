import type { CardioSession, DistanceUnit } from "./types";

const milesPerUnit: Record<DistanceUnit, number> = {
  mi: 1,
  km: 0.621371,
  m: 0.000621371,
  yd: 1 / 1760,
};

const metersPerUnit: Record<DistanceUnit, number> = {
  mi: 1609.344,
  km: 1000,
  m: 1,
  yd: 0.9144,
};

export type CardioPeriod = {
  date: string;
  sessions: number;
  minutes: number;
  miles: number;
  elevation: number;
  averageHeartRate: number | null;
  averageEffort: number | null;
};

function mondayFor(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function aggregate(
  sessions: CardioSession[],
  periodFor: (session: CardioSession) => string,
): CardioPeriod[] {
  const periods = new Map<string, CardioSession[]>();
  for (const session of sessions) {
    const period = periodFor(session);
    periods.set(period, [...(periods.get(period) ?? []), session]);
  }

  return [...periods.entries()]
    .map(([date, items]) => {
      const heartRateItems = items.filter((item) => item.average_heart_rate !== null);
      const heartRateMinutes = heartRateItems.reduce(
        (sum, item) => sum + item.duration_minutes,
        0,
      );
      const effortItems = items.filter((item) => item.perceived_effort !== null);
      const effortMinutes = effortItems.reduce((sum, item) => sum + item.duration_minutes, 0);
      return {
        date,
        sessions: items.length,
        minutes: items.reduce((sum, item) => sum + item.duration_minutes, 0),
        miles: items.reduce(
          (sum, item) => sum + (item.distance ?? 0) * milesPerUnit[item.distance_unit],
          0,
        ),
        elevation: items.reduce((sum, item) => sum + (item.elevation_gain ?? 0), 0),
        averageHeartRate: heartRateMinutes
          ? heartRateItems.reduce(
              (sum, item) => sum + item.average_heart_rate! * item.duration_minutes,
              0,
            ) / heartRateMinutes
          : null,
        averageEffort: effortMinutes
          ? effortItems.reduce(
              (sum, item) => sum + item.perceived_effort! * item.duration_minutes,
              0,
            ) / effortMinutes
          : null,
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function aggregateCardioDays(sessions: CardioSession[]) {
  return aggregate(sessions, (session) => session.logged_on);
}

export function aggregateCardioWeeks(sessions: CardioSession[]) {
  return aggregate(sessions, (session) => mondayFor(session.logged_on));
}

export type CardioPerformance = {
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  points: Array<{ date: string; value: number }>;
};

export function aggregateCardioPerformance(
  sessions: CardioSession[],
  activity: string,
): CardioPerformance {
  const byDay = new Map<string, CardioSession[]>();
  for (const session of sessions) {
    if (session.activity !== activity || session.distance === null) continue;
    byDay.set(session.logged_on, [...(byDay.get(session.logged_on) ?? []), session]);
  }

  let label = "Average pace";
  let unit = "min/mi";
  let lowerIsBetter = true;

  if (activity === "Cycling") {
    label = "Average speed";
    unit = "mph";
    lowerIsBetter = false;
  } else if (activity === "Swimming") {
    label = "Swim pace";
    unit = "min/100 yd";
  } else if (activity === "Rowing") {
    label = "Rowing pace";
    unit = "min/500 m";
  }

  const points = [...byDay.entries()].map(([date, items]) => {
    const minutes = items.reduce((sum, item) => sum + item.duration_minutes, 0);
    let distance = items.reduce(
      (sum, item) => sum + item.distance! * milesPerUnit[item.distance_unit],
      0,
    );
    let value = minutes / distance;

    if (activity === "Cycling") {
      value = distance / (minutes / 60);
    } else if (activity === "Swimming") {
      distance = items.reduce(
        (sum, item) => sum + item.distance! * metersPerUnit[item.distance_unit] / 0.9144,
        0,
      );
      value = minutes / (distance / 100);
    } else if (activity === "Rowing") {
      distance = items.reduce(
        (sum, item) => sum + item.distance! * metersPerUnit[item.distance_unit],
        0,
      );
      value = minutes / (distance / 500);
    }

    return { date, value };
  }).sort((left, right) => left.date.localeCompare(right.date));

  return { label, unit, lowerIsBetter, points };
}
