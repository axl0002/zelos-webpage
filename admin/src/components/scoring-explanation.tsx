import type {ScoreExplanation} from "@/lib/score-explanation";
const number = (value: number) => value.toLocaleString("en-GB", {maximumSignificantDigits: 9});
const percent = (value: number) => number(value * 100) + "%";
const list = (items: string[]) => items.length < 2 ? items[0] : items.slice(0, -1).join(", ") + " and " + items.at(-1);
export default function ScoringExplanation({explanation}: {explanation: ScoreExplanation | null}) {
  if (!explanation) return <section className="document-card" role="status">
    <h2>Scoring explanation is temporarily unavailable.</h2><p>We can’t verify the current method right now. Please try again shortly.</p>
  </section>;
  const {method, aggregation, example} = explanation;
  const rates = aggregation.contribution_multipliers.slice(0, 5).map(percent);
  const record = method.kind === "rank_only"
    ? "Each record’s leaderboard standing is scaled by its exercise weight."
    : `Each record blends ${percent(method.rank_share)} leaderboard standing and ${percent(method.performance_share)} performance against an expert reference, scaled by its exercise weight. Performance has diminishing returns.`;
  const terms = example.scores.map((score, i) => i === 0 ? `${number(score)} Elo` : `${number(score)} Elo × ${percent(aggregation.contribution_multipliers[i])}`);
  return <section className="document-card" aria-labelledby="elo-explanation-title">
    <h2 id="elo-explanation-title">How your Elo is calculated</h2>
    <p>Push and Pull are scored separately. {record}{" "}
      {method.performance_gate && "Performance can further reduce the blended score. "}
      {method.performance_capped && "The performance component is capped. "}
      One active progression counts per exercise. Up to {aggregation.top_k} {aggregation.top_k === 1 ? "highest exercise score contributes" : "highest exercise scores contribute"} {list(rates)}{aggregation.top_k > 5
        ? `, then each next rate is ${percent(aggregation.discount)} of the previous rate.` : ", respectively."}</p>
    <p><strong>Example exercise scores:</strong> {terms.join(" + ")} = {number(example.total)} overall Elo.</p>
    <p className="small muted">Explanation revision {explanation.revision} · Updated{" "}
      <time dateTime={explanation.updated_at}>{new Date(explanation.updated_at).toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric", timeZone: "UTC"})}</time></p>
  </section>;
}
