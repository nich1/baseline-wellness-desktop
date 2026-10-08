import { appToday } from "@/lib/dates";
import { buildWeeklyWeightHistory } from "@/lib/weekly-weight-history";
import type { BodyWeightRecord } from "@/lib/types";

type Props = {
  loading: boolean;
  records: BodyWeightRecord[];
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function recordDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function WeightHistoryTable({ loading, records }: Props) {
  const rows = buildWeeklyWeightHistory(records, appToday());

  return (
    <section className="weight-history-panel" aria-labelledby="weight-history-heading">
      <div className="weight-history-heading">
        <div>
          <h2 id="weight-history-heading">Weight history</h2>
          <p>Weekly averages run Monday through Sunday.</p>
        </div>
        <span>{records.length} weigh-ins</span>
      </div>

      {loading ? (
        <div className="weight-history-empty"><span className="loader" /> Loading history...</div>
      ) : rows.length === 0 ? (
        <div className="weight-history-empty">Your weigh-ins will appear here.</div>
      ) : (
        <div className="weight-history-scroll">
          <table className="weight-history-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Weight</th>
                <th scope="col">Weekly Average</th>
                <th scope="col">Body % Up / Down</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const date = recordDate(row.logged_on);
                return (
                  <tr key={row.logged_on}>
                    <td>{dateFormatter.format(date)}</td>
                    <td><strong>{row.weight.toFixed(1)}</strong> <small>LB</small></td>
                    <td>
                      {row.weeklyAverage === undefined ? null : (
                        <><strong>{row.weeklyAverage.toFixed(1)}</strong> <small>LB</small></>
                      )}
                    </td>
                    <td>
                      {row.weeklyChangePercent === undefined ? null : (
                        <strong className={
                          row.weeklyChangePercent > 0
                            ? "weight-change-up"
                            : row.weeklyChangePercent < 0
                              ? "weight-change-down"
                              : "weight-change-even"
                        }>
                          {row.weeklyChangePercent > 0 ? "↑" : row.weeklyChangePercent < 0 ? "↓" : "—"}
                          {" "}{Math.abs(row.weeklyChangePercent).toFixed(1)}%
                        </strong>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
