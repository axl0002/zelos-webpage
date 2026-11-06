import type { PublicScoreWeights } from "@/lib/score-weights";
import ScoreWeightTable from "./score-weight-table";

export default function ScoringWeights({ weights }: { weights: PublicScoreWeights | null }) {
  if (!weights) return (
    <section id="weights" className="document-card" role="status">
      <h2>Current exercise weights are temporarily unavailable.</h2>
      <p>We can’t verify the current weights right now. Please try again shortly.</p>
      <a href="/scoring#weights">Try again</a>
    </section>
  );
  return (
    <section id="weights">
      <h2>Current exercise weights</h2>
      <p>
        Each weight is the difficulty coefficient assigned to an exercise and progression.
        It is one input to scoring, not the final Elo earned for a record.
      </p>
      <p>Weights run from lowest to highest down the left. Each column is an exercise;
        progressions on the same row have the same weight.</p>
      <p>
        Weights revision {weights.revision} · Updated{" "}
        <time dateTime={weights.updated_at}>{new Date(weights.updated_at).toLocaleDateString("en-GB", {
          day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
        })}</time>
      </p>
      <ScoreWeightTable rules={weights} discipline="push" />
      <ScoreWeightTable rules={weights} discipline="pull" />
      {weights.unranked_exercises.length > 0 && <p>
        Available for training, with ranking not yet enabled: {weights.unranked_exercises.map(row => row.name).join(", ")}.
        These exercises have no ranked weight in the tables.
      </p>}
      <p><a href="/scoring/weights.csv" download>Download current weights (CSV)</a></p>
    </section>
  );
}
