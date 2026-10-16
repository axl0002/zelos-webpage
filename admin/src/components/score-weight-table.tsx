import type { ScoreRules } from "@/lib/score-rules";

export default function ScoreWeightTable({
  rules,
  discipline,
}: {
  rules: ScoreRules;
  discipline: "push" | "pull";
}) {
  const enabled = rules.weights.filter((w) => w.enabled || w.availability === "coming_soon");
  const boards = enabled.filter((w) => w.discipline === discipline);
  const exercises = [...new Set(boards.map((w) => w.exercise))];
  // Both disciplines use a shared scale, including unoccupied weight rows.
  const values = enabled.map((w) => w.weight);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  // Keep a usable scale for very large future weights without limiting weights.
  const step = Math.max(5, 5 * Math.ceil((high - low) / 500 / 5));
  const count = Math.min(500, Math.floor((high - low) / step));
  const weights = [...new Set([
    ...Array.from({ length: count + 1 }, (_, i) => low + i * step),
    ...values,
  ])].sort((a, b) => a - b);
  const title = discipline === "push" ? "Push" : "Pull";
  return (
    <div>
      <h3>{title}</h3>
      <div
        className="scoring-table-scroll"
        role="region"
        aria-label={`${title} weight comparison`}
        tabIndex={0}
      >
        <table
          className="scoring-weight-table"
          style={{ minWidth: Math.max(720, 76 + exercises.length * 128) }}
        >
          <caption className="visually-hidden">
            All {discipline} exercise and progression weights
          </caption>
          <thead>
            <tr>
              <th scope="col">Weight</th>
              {exercises.map((exercise) => (
                <th scope="col" key={exercise}>
                  {exercise}
                  {boards.some((w) => w.exercise === exercise && w.availability === "coming_soon") && (
                    <span className="scoring-status">Coming soon</span>
                  )}
                  <span className="scoring-measure">
                    {boards.find((w) => w.exercise === exercise)!.metric === "seconds"
                      ? "Hold (seconds)"
                      : "Reps"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weights.map((weight) => (
              <tr key={weight}>
                <th scope="row">{weight}</th>
                {exercises.map((exercise) => (
                  <td key={exercise}>
                    {boards
                      .filter((w) => w.exercise === exercise && w.weight === weight)
                      .map((w) => (
                        <div key={w.id}>
                          {w.progression || w.exercise}
                        </div>
                      ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
