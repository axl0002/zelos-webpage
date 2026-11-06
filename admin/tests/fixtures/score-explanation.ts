import type {ScoreExplanation} from "../../src/lib/score-explanation";
export function explanationFixture(kind: ScoreExplanation["method"]["kind"] = "additive_log", top = 5, discount = .7, rankShare = .5): ScoreExplanation {
  const multipliers = Array.from({length: top}, (_, i) => Math.pow(discount, i)), scores = [100,80,60].slice(0,top);
  const contributions = scores.map((score, i) => score * multipliers[i]);
  return {schema_version: 1, revision: 75, updated_at: "2026-11-06T06:00:00Z",
    method: {kind, rank_share: kind === "rank_only" ? 1 : rankShare, performance_share: kind === "rank_only" ? 0 : 1-rankShare,
      performance_curve: kind === "rank_only" ? null : "logarithmic", performance_gate: kind === "gated_log", performance_capped: false},
    aggregation: {selection: "one_active_progression_per_exercise", top_k: top, discount, contribution_multipliers: multipliers},
    example: {scores, contributions, total: contributions.reduce((sum, value) => sum + value, 0)}};
}
