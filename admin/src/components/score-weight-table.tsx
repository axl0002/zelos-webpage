import type { ScoreRules } from "@/lib/score-rules";

export default function ScoreWeightTable({
  rules,
  discipline,
}: {
  rules: ScoreRules;
  discipline: "push" | "pull";
}) {
  const boards = rules.weights.filter((w) => w.discipline === discipline);
  const exercises = [...new Set(boards.map((w) => w.exercise))];
  // Use the same ascending weight rows in both tables for easier comparison.
  const weights = [...new Set(rules.weights.map((w) => w.weight))].sort(
    (a, b) => a - b,
  );
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
        <table className="scoring-weight-table">
          <caption className="visually-hidden">
            All {discipline} exercise and progression weights
          </caption>
          <thead>
            <tr>
              <th scope="col">Weight</th>
              {exercises.map((exercise) => (
                <th scope="col" key={exercise}>
                  {exercise}
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
                        <div key={w.id} className={w.enabled ? "" : "scoring-disabled"}>
                          {w.progression || w.exercise}
                          {!w.enabled && <span className="scoring-status">Disabled</span>}
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
