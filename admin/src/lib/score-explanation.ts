export type ScoreExplanation = {
  schema_version: 1; revision: number; updated_at: string;
  method: {kind: "rank_only" | "additive_log" | "gated_log"; rank_share: number; performance_share: number;
    performance_curve: "logarithmic" | null; performance_gate: boolean; performance_capped: boolean};
  aggregation: {selection: "one_active_progression_per_exercise"; top_k: number; discount: number; contribution_multipliers: number[]};
  example: {scores: number[]; contributions: number[]; total: number};
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
function numbers(value: unknown, length: number): number[] {
  if (!Array.isArray(value) || value.length !== length || !value.every(number)) throw Error("Scoring explanation unavailable");
  return [...value];
}
export function parseScoreExplanation(value: unknown): ScoreExplanation {
  const fail = (): never => { throw Error("Scoring explanation unavailable"); };
  if (!object(value) || value.schema_version !== 1 || !Number.isSafeInteger(value.revision) || !number(value.revision) || value.revision < 1 ||
      typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at)) ||
      !object(value.method) || !object(value.aggregation) || !object(value.example)) return fail();
  const m = value.method, a = value.aggregation, e = value.example;
  if (typeof m.kind !== "string" || !["rank_only", "additive_log", "gated_log"].includes(m.kind) ||
      !number(m.rank_share) || m.rank_share > 1 || !number(m.performance_share) || m.performance_share > 1 || !close(m.rank_share + m.performance_share, 1) ||
      typeof m.performance_gate !== "boolean" || typeof m.performance_capped !== "boolean" ||
      (m.kind === "rank_only" ? m.rank_share !== 1 || m.performance_share !== 0 || m.performance_curve !== null || m.performance_gate || m.performance_capped :
        m.performance_curve !== "logarithmic" || m.performance_gate !== (m.kind === "gated_log")) ||
      a.selection !== "one_active_progression_per_exercise" || !number(a.top_k) || !Number.isSafeInteger(a.top_k) || a.top_k < 1 || a.top_k > 30 ||
      !number(a.discount) || a.discount < .1 || a.discount > 1 || !number(e.total)) return fail();
  const multipliers = numbers(a.contribution_multipliers, a.top_k);
  if (multipliers.some((rate, index) => rate > 1 || !close(rate, Math.pow(a.discount as number, index)))) return fail();
  if (!Array.isArray(e.scores) || !e.scores.length || e.scores.length > Math.min(3, a.top_k)) return fail();
  const scores = numbers(e.scores, e.scores.length), contributions = numbers(e.contributions, scores.length);
  if (scores.some((score, index) => index > 0 && score > scores[index - 1]) ||
      contributions.some((amount, index) => !close(amount, scores[index] * multipliers[index])) ||
      !close(e.total, contributions.reduce((total, amount) => total + amount, 0))) return fail();
  return {schema_version: 1, revision: value.revision, updated_at: value.updated_at,
    method: {kind: m.kind as ScoreExplanation["method"]["kind"], rank_share: m.rank_share, performance_share: m.performance_share,
      performance_curve: m.performance_curve as "logarithmic" | null, performance_gate: m.performance_gate, performance_capped: m.performance_capped},
    aggregation: {selection: "one_active_progression_per_exercise", top_k: a.top_k, discount: a.discount, contribution_multipliers: multipliers},
    example: {scores, contributions, total: e.total}};
}
