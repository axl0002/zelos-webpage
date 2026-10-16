import { formatPoints, recordPoints, type ScoreRules } from "@/lib/score-rules";
import ScoreCalculator from "./score-calculator";
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
      <nav className="scores-jump" aria-label="On this page">
        <a href="#formula">The formula</a>
        <a href="#weights">All weights</a>
        <a href="#examples">Examples</a>
        <a href="#calculator">Try it</a>
        <a href="#questions">Questions</a>
      </nav>
      <section className="scores-overview" aria-label="How scoring works">
        <article>
          <span>01</span>
          <h2>One record per exercise</h2>
          <p>
            Your current eligible record represents each exercise. Different
            progressions of the same exercise do not stack.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Performance becomes points</h2>
          <p>
            Your worldwide position within the same progression and gender
            determines your share of its weight.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Your best {rules.top_k} count</h2>
          <p>
            Add your highest-scoring exercises in each discipline. Push and Pull
            have separate totals and rankings.
          </p>
        </article>
      </section>
      <section id="formula" className="scores-section">
        <div className="scores-section-heading">
          <span className="scores-eyebrow">01 / The calculation</span>
          <h2>A formula you can check.</h2>
          <p>
            More reps or a longer hold improve your position. Position and
            progression weight determine the points.
          </p>
        </div>
        <div
          className="scores-equation"
          role="math"
          aria-label="Points equals W times N minus R plus 1 plus S divided by 2, all divided by N plus S"
        >
          <span>Points = W ×</span>
          <span className="scores-fraction">
            <span>N − R + 1 + S × 0.5</span>
            <span>N + S</span>
          </span>
        </div>
        <dl className="scores-variables">
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
        <aside className="scores-note">
          <h3>Weight is not points per rep.</h3>
          <p>
            A weight of 85 does not mean 85 points for every second held. It
            scales the result of the formula. A larger lead in reps or seconds
            only adds points if it improves your position.
          </p>
        </aside>
      </section>
      <section id="weights" className="scores-section">
        <div className="scores-section-heading">
          <span className="scores-eyebrow">02 / Every weight</span>
          <h2>Same rules. Published weights.</h2>
          <p>
            These are the current configured weights for every publicly listed
            board. Weights express progression difficulty in the scoring system;
            they are adjustable policy choices, not a scientific measure of
            strength.
          </p>
        </div>
        <p className="scores-table-meta">
          {active.length} active boards · {rules.weights.length - active.length}{" "}
          disabled boards. Disabled boards contribute no points.
        </p>
        <div className="scores-weight-grid">
          {(["push", "pull"] as const).map((d) => (
            <div key={d} className="scores-weight-card">
              <h3>{d === "push" ? "Push" : "Pull"}</h3>
              <div className="scores-table-scroll">
                <table>
                  <caption className="visually-hidden">
                    All {d} exercise and progression weights
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Exercise / progression</th>
                      <th scope="col">Measure</th>
                      <th scope="col" className="scores-number">
                        Weight
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.weights
                      .filter((w) => w.discipline === d)
                      .map((w) => (
                        <tr
                          key={w.id}
                          className={w.enabled ? "" : "scores-disabled"}
                        >
                          <th scope="row">
                            {w.exercise}
                            {w.progression && (
                              <span className="scores-progression">
                                {w.progression}
                              </span>
                            )}
                            {!w.enabled && (
                              <span className="scores-status">Disabled</span>
                            )}
                          </th>
                          <td>
                            {w.metric === "seconds" ? "Hold (s)" : "Reps"}
                          </td>
                          <td className="scores-number">{w.weight}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section id="examples" className="scores-section">
        <div className="scores-section-heading">
          <span className="scores-eyebrow">03 / Worked examples</span>
          <h2>Follow the points.</h2>
          <p>
            These examples use the published weights above and hypothetical
            leaderboard positions.
          </p>
        </div>
        {example && (
          <div className="scores-example-grid">
            <article className="scores-example">
              <span className="scores-eyebrow">A record score</span>
              <h3>{example.name}</h3>
              <p>
                Weight {example.weight}, 10 athletes, first place, smoothing{" "}
                {rules.smoothing}.
              </p>
              <p className="scores-worked">
                {example.weight} × (10 − 1 + 1 + {rules.smoothing} × 0.5) ÷ (10
                + {rules.smoothing})
              </p>
              <strong className="scores-example-result">
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
            <article className="scores-example">
              <span className="scores-eyebrow">
                Why small boards are smoothed
              </span>
              <h3>First out of one.</h3>
              <p>
                With the same weight of {example.weight}, being the only athlete
                on a board earns:
              </p>
              <p className="scores-worked">
                {example.weight} × (1 − 1 + 1 + {rules.smoothing} × 0.5) ÷ (1 +{" "}
                {rules.smoothing})
              </p>
              <strong className="scores-example-result">
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
          <article className="scores-total-example">
            <div>
              <span className="scores-eyebrow">Your discipline total</span>
              <h3>Keep your highest {rules.top_k} exercise scores.</h3>
              <p>
                Here is a hypothetical Pull athlete. Each board has 10 athletes.
                Only one progression per exercise is counted.
              </p>
              <p>
                If you have fewer than {rules.top_k} eligible exercises, all of
                them count. Scores are added before rounding.
              </p>
              <strong className="scores-example-result">
                {formatPoints(total)} <span>Pull points</span>
              </strong>
            </div>
            <div className="scores-table-scroll">
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
                      className={i < rules.top_k ? "" : "scores-disabled"}
                    >
                      <th scope="row">
                        {r.w.name}
                        {i >= rules.top_k && (
                          <span className="scores-status">
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
      <section id="calculator" className="scores-section">
        <div className="scores-section-heading">
          <span className="scores-eyebrow">04 / Try the maths</span>
          <h2>Calculate a record score.</h2>
          <p>
            Choose a progression, set a board size and change your position. The
            calculation happens here in your browser and does not submit a
            record.
          </p>
        </div>
        <ScoreCalculator rules={rules} />
      </section>
      <section id="questions" className="scores-section">
        <div className="scores-section-heading">
          <span className="scores-eyebrow">05 / The details that matter</span>
          <h2>No hidden scoring rules.</h2>
        </div>
        <div className="scores-faq">
          <details>
            <summary>Why can my points change without a new record?</summary>
            <p>
              Your score is relative to the other eligible athletes on your
              progression board. New records, improved results or removed
              results can change its size or your position. Weights and scoring
              rules can also be updated. There is currently no time-based decay.
            </p>
          </details>
          <details>
            <summary>How are ties handled?</summary>
            <p>
              Equal rep counts or hold times share the same position and points.
              Positions use competition ranking: 1, 1, 3, rather than 1, 1, 2.
              The achievement time and record ID give tied rows a stable display
              order; they do not break a points tie.
            </p>
          </details>
          <details>
            <summary>Do country filters change my points?</summary>
            <p>
              No. Points use worldwide positions within the same progression and
              gender. A country filter changes the displayed rank within that
              country, while keeping your points the same.
            </p>
          </details>
          <details>
            <summary>Does blocking someone change points?</summary>
            <p>
              Blocking can hide an athlete from your view. It does not remove
              their eligible record from the worldwide scoring group or
              recalculate everyone’s points.
            </p>
          </details>
          <details>
            <summary>
              Can I earn points from every progression of an exercise?
            </summary>
            <p>
              Only your current selected eligible record for an exercise counts.
              For example, Tuck Planche and Full Planche do not both contribute
              to your total. Moving progression replaces the exercise’s current
              scoring entry; historical clips can remain available.
            </p>
          </details>
          <details>
            <summary>Which records are eligible?</summary>
            <p>
              A record must be the athlete’s current entry, with a published,
              visible and playable clip, on an enabled board and exercise. The
              athlete must have a complete profile and an unrestricted account.
              Removed, hidden or ineligible records do not contribute. Flagging
              a ranking issue alone does not remove its points; a confirmed
              review can.
            </p>
          </details>
          <details>
            <summary>
              Does voting, popularity or money affect these points?
            </summary>
            <p>
              This formula uses the recorded performance rank, board size,
              progression weight and smoothing value. Likes, followers, votes
              and payments are not inputs. This guide covers exercise-record
              points for Push and Pull, rather than any separate voting or
              battle rating.
            </p>
          </details>
          <details>
            <summary>
              Why might the app show a slightly different decimal?
            </summary>
            <p>
              The app displays points to one decimal place. Examples here show
              two. Ranking and totals use unrounded values, so two displayed
              totals can look equal even when their underlying scores differ.
            </p>
          </details>
          <details>
            <summary>What happens when the rules change?</summary>
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
          </details>
        </div>
      </section>
      <section className="scores-source">
        <div>
          <h2>Check the rules yourself.</h2>
          <p>
            The machine-readable rules contain the same formula, settings and
            weights used on this page. They contain no athlete records.
          </p>
        </div>
        <a className="scores-download" href="/scores/rules.json">
          View scoring rules (JSON) ↗
        </a>
      </section>
      <p className="scores-feedback">
        Found something unclear?{" "}
        <a href="mailto:support@zelos.club?subject=Scoring%20question">
          Ask us about scoring.
        </a>
      </p>
    </>
  );
}
