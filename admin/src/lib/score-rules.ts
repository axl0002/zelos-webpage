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
  review_policy?: {
    enabled: boolean;
    top_percent: number;
    always_review_boards: {id: string; name: string}[];
  };
  claim_policy?: {
    reps: "positive_integer_no_exercise_maximum";
    seconds: "positive_integer_board_maximum";
  };
  clip_policy?: {
    ranked_hold_extra_seconds: number;
    ranked_hold_min_extra_seconds: number;
    scope: "new_uploads";
  };
  submission_policy?: {
    active_entries_per_exercise: 1;
    replacement_confirmation_required: true;
    replacement_timing: "successful_publication_after_required_review";
    previous_video: "retained";
    selection: "latest_confirmed_publication";
  };
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
  const policy = r.review_policy;
  if (policy !== undefined && (!policy || typeof policy !== "object" ||
    typeof policy.enabled !== "boolean" || !finite(policy.top_percent) ||
    policy.top_percent < 0 || policy.top_percent > 100 ||
    !Array.isArray(policy.always_review_boards) || policy.always_review_boards.length > 500 ||
    policy.always_review_boards.some(board => !board || !text(board.id) || !text(board.name)) ||
    new Set(policy.always_review_boards.map(board => board.id)).size !== policy.always_review_boards.length)) {
    throw new Error("Scoring rules unavailable");
  }
  const claimPolicy = r.claim_policy;
  if (claimPolicy !== undefined && (!claimPolicy || typeof claimPolicy !== "object" ||
    claimPolicy.reps !== "positive_integer_no_exercise_maximum" ||
    claimPolicy.seconds !== "positive_integer_board_maximum")) {
    throw new Error("Scoring rules unavailable");
  }
  const clipPolicy = r.clip_policy;
  if (clipPolicy !== undefined && (!clipPolicy || typeof clipPolicy !== "object" ||
    clipPolicy.scope !== "new_uploads" ||
    !Number.isSafeInteger(clipPolicy.ranked_hold_extra_seconds) ||
    !Number.isSafeInteger(clipPolicy.ranked_hold_min_extra_seconds) ||
    clipPolicy.ranked_hold_min_extra_seconds < 1 ||
    clipPolicy.ranked_hold_extra_seconds < clipPolicy.ranked_hold_min_extra_seconds ||
    clipPolicy.ranked_hold_extra_seconds > 180)) {
    throw new Error("Scoring rules unavailable");
  }
  const submissionPolicy = r.submission_policy;
  if (submissionPolicy !== undefined && (!submissionPolicy || typeof submissionPolicy !== "object" ||
    submissionPolicy.active_entries_per_exercise !== 1 ||
    submissionPolicy.replacement_confirmation_required !== true ||
    submissionPolicy.replacement_timing !== "successful_publication_after_required_review" ||
    submissionPolicy.previous_video !== "retained" ||
    submissionPolicy.selection !== "latest_confirmed_publication")) {
    throw new Error("Scoring rules unavailable");
  }
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
    ...(policy === undefined ? {} : {review_policy: {
      enabled: policy.enabled,
      top_percent: policy.top_percent,
      always_review_boards: policy.always_review_boards.map(board => ({id: board.id, name: board.name})),
    }}),
    ...(claimPolicy === undefined ? {} : {claim_policy: {
      reps: claimPolicy.reps, seconds: claimPolicy.seconds,
    }}),
    ...(clipPolicy === undefined ? {} : {clip_policy: {
      ranked_hold_extra_seconds: clipPolicy.ranked_hold_extra_seconds,
      ranked_hold_min_extra_seconds: clipPolicy.ranked_hold_min_extra_seconds,
      scope: "new_uploads" as const,
    }}),
    ...(submissionPolicy === undefined ? {} : {submission_policy: {
      active_entries_per_exercise: 1 as const,
      replacement_confirmation_required: true as const,
      replacement_timing: "successful_publication_after_required_review" as const,
      previous_video: "retained" as const,
      selection: "latest_confirmed_publication" as const,
    }}),
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

// Alternative algorithms remain private. A recognized scores-only contract
// explicitly retires the old public calculator rather than showing stale math.
export type ScoreStatus={schema_version:2;mode:"scores_only";revision:number;updated_at:string};
export type PublicScoreRules=ScoreRules|ScoreStatus;
export function parsePublicScoreRules(value:unknown):PublicScoreRules {
 if(value&&typeof value==="object"&&"schema_version" in value&&value.schema_version===2){
  const v=value as Record<string,unknown>;
  if(v.mode!=="scores_only"||typeof v.revision!=="number"||!Number.isSafeInteger(v.revision)||v.revision<1||typeof v.updated_at!=="string"||!Number.isFinite(Date.parse(v.updated_at)))throw Error("Invalid scoring status");
  return {schema_version:2,mode:"scores_only",revision:v.revision,updated_at:v.updated_at};
 }
 return parseScoreRules(value);
}
