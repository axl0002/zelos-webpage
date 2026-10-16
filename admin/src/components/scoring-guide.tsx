import { formatPoints, recordPoints, type ScoreRules } from "@/lib/score-rules";
import ScoreCalculator from "./score-calculator";
import ScoreWeightTable from "./score-weight-table";
export default function ScoringGuide({ rules }: { rules: ScoreRules }) {
  const active = rules.weights.filter((w) => w.enabled);
  const example = active.find((w) => w.id === "planche-hold-full") ?? active[0];
  const pullBest = new Map<string, (typeof active)[number]>();
  for (const w of active.filter((w) => w.discipline === "pull"))
    if (
      !pullBest.has(w.exercise) ||
      pullBest.get(w.exercise)!.weight < w.weight
    )
      pullBest.set(w.exercise, w);
  const totals = [...pullBest.values()]
    .slice(0, 10)
    .map((w, i) => ({
      w,
      rank: i + 1,
      points: recordPoints(w.weight, 10, i + 1, rules.smoothing)!,
    }))
    .sort((a, b) => b.points - a.points);
  const total = totals
    .slice(0, rules.top_k)
    .reduce((sum, r) => sum + r.points, 0);
  return (
    <>
      <section className="document-card">
        <h2>Quick Summary</h2>
        <ul>
          <li>
            Your current eligible record represents each exercise. Different
            progressions of the same exercise do not stack.
          </li>
          <li>
            Your worldwide position within the same progression and gender
            determines your share of its weight.
          </li>
          <li>
            Your best {rules.top_k} exercise scores count in each discipline.
            Push and Pull have separate totals and rankings.
          </li>
        </ul>
      </section>
      <section id="formula">
        <div>
          <h2>1. The Formula</h2>
          <p>
            More reps or a longer hold improve your position. Position and
            progression weight determine the points.
          </p>
        </div>
        <div
          className="document-notice scoring-equation"
          role="math"
          aria-label="Points equals W times N minus R plus 1 plus S divided by 2, all divided by N plus S"
        >
          <span>Points = W ×</span>
          <span className="scoring-fraction">
            <span>N − R + 1 + S × 0.5</span>
            <span>N + S</span>
          </span>
        </div>
        <dl className="scoring-variables">
          <div>
            <dt>
              W <span>Progression weight</span>
            </dt>
            <dd>
              The configured value for this exercise and progression. Every
              weight is listed below.
            </dd>
          </div>
          <div>
            <dt>
              N <span>Number of athletes</span>
            </dt>
            <dd>
              The eligible current records on this progression board, within the
              same gender.
            </dd>
          </div>
          <div>
            <dt>
              R <span>Your position</span>
            </dt>
            <dd>
              Your worldwide competition rank on that board. First place is 1.
              Equal results share a position.
            </dd>
          </div>
          <div>
            <dt>
              S <span>Small-board smoothing</span>
            </dt>
            <dd>
              Currently <strong>{rules.smoothing}</strong>. It pulls results on
              small boards towards 50% of the weight, reducing the advantage of
              being first among very few athletes.
            </dd>
          </div>
        </dl>
        <aside className="document-notice">
          <p>
            <strong>What the weight means:</strong> A weight of 85 does not mean
            85 points for every second held. It
            scales the result of the formula. A larger lead in reps or seconds
            only adds points if it improves your position.
          </p>
        </aside>
      </section>
      <section id="weights">
        <div>
          <h2>2. Exercise and Progression Weights</h2>
          <p>
            These are the configured exercise and progression weights.
            Weights express progression difficulty in the scoring system;
            they are adjustable policy choices, not a scientific measure of
            strength.
          </p>
        </div>
        <p>
          Weights run from lowest to highest down the left. Each column is an
          exercise; progressions on the same row have the same weight.
          SAT means straight-arm touch.
        </p>
        <ScoreWeightTable rules={rules} discipline="push" />
        <ScoreWeightTable rules={rules} discipline="pull" />
      </section>
      <section id="examples">
        <div>
          <h2>3. Worked Examples</h2>
          <p>
            These examples use the published weights above and hypothetical
            leaderboard positions.
          </p>
        </div>
        {example && (
          <div>
            <article>
              <h3>{example.name}</h3>
              <p>
                Weight {example.weight}, 10 athletes, first place, smoothing{" "}
                {rules.smoothing}.
              </p>
              <p className="scoring-worked">
                {example.weight} × (10 − 1 + 1 + {rules.smoothing} × 0.5) ÷ (10
                + {rules.smoothing})
              </p>
              <strong className="scoring-example-result">
                {formatPoints(
                  recordPoints(example.weight, 10, 1, rules.smoothing)!,
                )}{" "}
                <span>points</span>
              </strong>
              <table>
                <caption>Same board, different positions</caption>
                <thead>
                  <tr>
                    <th scope="col">Position</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 5, 10].map((rank) => (
                    <tr key={rank}>
                      <td>#{rank} of 10</td>
                      <td>
                        {formatPoints(
                          recordPoints(
                            example.weight,
                            10,
                            rank,
                            rules.smoothing,
                          )!,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
            <article>
              <h3>A board with one athlete</h3>
              <p>
                With the same weight of {example.weight}, being the only athlete
                on a board earns:
              </p>
              <p className="scoring-worked">
                {example.weight} × (1 − 1 + 1 + {rules.smoothing} × 0.5) ÷ (1 +{" "}
                {rules.smoothing})
              </p>
              <strong className="scoring-example-result">
                {formatPoints(
                  recordPoints(example.weight, 1, 1, rules.smoothing)!,
                )}{" "}
                <span>points</span>
              </strong>
              <p>
                As the board grows, position plays a stronger role. When
                smoothing is zero, there is no adjustment towards 50%.
              </p>
            </article>
          </div>
        )}
        {totals.length > 0 && (
          <article>
            <div>
              <h3>Discipline total: your highest {rules.top_k} exercise scores</h3>
              <p>
                Here is a hypothetical Pull athlete. Each board has 10 athletes.
                Only one progression per exercise is counted.
              </p>
              <p>
                If you have fewer than {rules.top_k} eligible exercises, all of
                them count. Scores are added before rounding.
              </p>
              <strong className="scoring-example-result">
                {formatPoints(total)} <span>Pull points</span>
              </strong>
            </div>
            <div className="scoring-table-scroll">
              <table>
                <caption>Hypothetical Pull records</caption>
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Rank</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((r, i) => (
                    <tr
                      key={r.w.id}
                      className={i < rules.top_k ? "" : "scoring-disabled"}
                    >
                      <th scope="row">
                        {r.w.name}
                        {i >= rules.top_k && (
                          <span className="scoring-status">
                            Outside best {rules.top_k}
                          </span>
                        )}
                      </th>
                      <td>#{r.rank}</td>
                      <td>{formatPoints(r.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </section>
      <section id="calculator">
        <div>
          <h2>4. Points Calculator</h2>
          <p>
            Choose a progression, set a board size and change your position. The
            calculation happens here in your browser and does not submit a
            record.
          </p>
        </div>
        <ScoreCalculator rules={rules} />
      </section>
      <section id="questions">
        <div>
          <h2>5. Scoring Rules</h2>
        </div>
        <div>
          <div>
            <h3>Can a progression have a weight above 100?</h3>
            <p>
              Yes. Weights are relative scoring values, not percentages or a
              scale capped at 100. Harder skills can be assigned higher weights
              as they are added. For example, a weight of 150 with a scoring
              factor of 0.75 gives 112.5 points. Adding a higher weight does not
              require rescaling existing weights.
            </p>
          </div>
          <div>
            <h3>Why can my points change without a new record?</h3>
            <p>
              Your score is relative to the other eligible athletes on your
              progression board. New records, improved results or removed
              results can change its size or your position. Weights and scoring
              rules can also be updated. There is currently no time-based decay.
            </p>
          </div>
          <div>
            <h3>How are ties handled?</h3>
            <p>
              Equal rep counts or hold times share the same position and points.
              Positions use competition ranking: 1, 1, 3, rather than 1, 1, 2.
              The achievement time and record ID give tied rows a stable display
              order; they do not break a points tie.
            </p>
          </div>
          <div>
            <h3>Do country filters change my points?</h3>
            <p>
              No. Points use worldwide positions within the same progression and
              gender. A country filter changes the displayed rank within that
              country, while keeping your points the same.
            </p>
          </div>
          <div>
            <h3>Does blocking someone change points?</h3>
            <p>
              Blocking can hide an athlete from your view. It does not remove
              their eligible record from the worldwide scoring group or
              recalculate everyone’s points.
            </p>
          </div>
          <div>
            <h3>
              Can I earn points from every progression of an exercise?
            </h3>
            <p>
              Only your current selected eligible record for an exercise counts.
              For example, Tuck Planche and Full Planche do not both contribute
              to your total. Moving progression replaces the exercise’s current
              scoring entry; historical clips can remain available.
            </p>
          </div>
          <div>
            <h3>Which records are eligible?</h3>
            <p>
              A record must be the athlete’s current entry, with a published,
              visible and playable clip, on an enabled board and exercise. The
              athlete must have a complete profile and an unrestricted account.
              Removed, hidden or ineligible records do not contribute. Flagging
              a ranking issue alone does not remove its points; a confirmed
              review can.
            </p>
          </div>
          <div>
            <h3>
              Does voting, popularity or money affect these points?
            </h3>
            <p>
              This formula uses the recorded performance rank, board size,
              progression weight and smoothing value. Likes, followers, votes
              and payments are not inputs. This guide covers exercise-record
              points for Push and Pull, rather than any separate voting or
              battle rating.
            </p>
          </div>
          <div>
            <h3>
              Why might the app show a slightly different decimal?
            </h3>
            <p>
              The app displays points to one decimal place. Examples here show
              two. Ranking and totals use unrounded values, so two displayed
              totals can look equal even when their underlying scores differ.
            </p>
          </div>
          <div>
            <h3>What happens when the rules change?</h3>
            <p>
              The weights and settings here are read from the scoring
              configuration. Their publication revision and update date change
              with it. Formula changes must update this explanation and
              calculator in the same release. A verification check prevents an
              unsupported formula from being shown with an old explanation.
            </p>
            <p>
              Rankings are recalculated with the new rules. If a recalculation
              is pending, the app can show an updating notice while the new
              totals are prepared.
            </p>
          </div>
        </div>
      </section>
      <section className="document-card">
        <h2>Scoring Data</h2>
        <p>
          The machine-readable rules contain the same formula, settings and
          weights used on this page. They contain no athlete records.
        </p>
        <p><a href="/scoring/rules.json">View scoring rules (JSON)</a></p>
        <p className="document-muted">
          Questions about scoring?{" "}
          <a href="mailto:support@zelos.club?subject=Scoring%20question">
            Contact support.
          </a>
        </p>
      </section>
    </>
  );
}
