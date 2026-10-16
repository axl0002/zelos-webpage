export type ScoreWeight = {
  id: string;
  name: string;
  exercise: string;
  progression: string | null;
  discipline: "push" | "pull";
  metric: "reps" | "seconds";
  weight: number;
  enabled: boolean;
  availability?: "active" | "coming_soon" | "disabled";
};
export type ScoreRules = {
  schema_version: 1;
  algorithm: "rank_percentile_v1";
  formula_version: 1;
  revision: number;
  updated_at: string;
  top_k: number;
  smoothing: number;
  prior: 0.5;
  formula: string;
  weights: ScoreWeight[];
};
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const text = (s: unknown): s is string =>
  typeof s === "string" && s.length > 0 && s.length <= 300;
export function parseScoreRules(value: unknown): ScoreRules {
  if (!value || typeof value !== "object")
    throw new Error("Scoring rules unavailable");
  const r = value as ScoreRules;
  if (
    r.schema_version !== 1 ||
    r.algorithm !== "rank_percentile_v1" ||
    r.formula_version !== 1 ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 1 ||
    typeof r.updated_at !== "string" ||
    !Number.isFinite(Date.parse(r.updated_at)) ||
    !Number.isInteger(r.top_k) ||
    r.top_k < 1 ||
    r.top_k > 30 ||
    !finite(r.smoothing) ||
    r.smoothing < 0 ||
    r.prior !== 0.5 ||
    r.formula !== "W * (N - R + 1 + S * 0.5) / (N + S)" ||
    !Array.isArray(r.weights) ||
    r.weights.length > 500 ||
    r.weights.some(
      (w) =>
        !w ||
        !text(w.id) ||
        !text(w.name) ||
        !text(w.exercise) ||
        (w.progression !== null && !text(w.progression)) ||
        !["push", "pull"].includes(w.discipline) ||
        !["reps", "seconds"].includes(w.metric) ||
        typeof w.enabled !== "boolean" ||
        (w.availability !== undefined &&
          (!["active", "coming_soon", "disabled"].includes(w.availability) ||
           w.enabled !== (w.availability === "active"))) ||
        !finite(w.weight) ||
        w.weight < 0,
    ) ||
    new Set(r.weights.map((w) => w.id)).size !== r.weights.length
  )
    throw new Error("Scoring rules unavailable");
  // An explicit allowlist also prevents future RPC fields leaking into HTML/JSON.
  return {
    schema_version: 1,
    algorithm: r.algorithm,
    formula_version: 1,
    revision: r.revision,
    updated_at: r.updated_at,
    top_k: r.top_k,
    smoothing: r.smoothing,
    prior: 0.5,
    formula: r.formula,
    weights: r.weights.map((w) => ({
      id: w.id,
      name: w.name,
      exercise: w.exercise,
      progression: w.progression,
      discipline: w.discipline,
      metric: w.metric,
      weight: w.weight,
      enabled: w.enabled,
      availability: w.availability ?? (w.enabled ? "active" : "disabled"),
    })),
  };
}
export function recordPoints(
  weight: number,
  participants: number,
  rank: number,
  smoothing: number,
): number | null {
  if (
    ![weight, participants, rank, smoothing].every(Number.isFinite) ||
    weight < 0 ||
    !Number.isSafeInteger(participants) ||
    participants < 1 ||
    !Number.isSafeInteger(rank) ||
    rank < 1 ||
    rank > participants ||
    smoothing < 0
  )
    return null;
  return (
    weight * ((participants - rank + 1 + smoothing * 0.5) /
    (participants + smoothing))
  );
}
export const formatPoints = (points: number) =>
  points.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
