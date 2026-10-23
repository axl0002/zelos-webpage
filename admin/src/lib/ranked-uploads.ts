import {parseExerciseRules, parseRuleIds, type ExerciseRule} from "./exercise-rules";
import {rankedReviewReasons} from "./ranked-review-reasons";
export const rankedUploadReasons = {
  ...rankedReviewReasons,
  other: "Other",
} as const;
export type RankedUploadReason = keyof typeof rankedUploadReasons;
export type RankedUploadGuidelines = {
  board_id: string;
  form_standard: string;
  camera_standard: string;
  form_checkpoints: string[];
  counting_standard: string | null;
  common_mistakes: string[];
  demo_caption: string | null;
  rules: ExerciseRule[];
};
export type RankedUploadReview = {
  id: string; owner_id: string; post_id: string; title: string; username: string;
  created_at: string; board_id: string; board_name: string; exercise_name: string;
  progression: string | null; metric: "reps" | "seconds"; claim: number;
  hold_timing?: {start_ms: number; end_ms: number; duration_ms: number} | null;
  guidelines: RankedUploadGuidelines; projected_rank: number | null;
  participants: number | null; cutoff: number | null; top_percent: number;
  always_require_review: boolean; reason: "top_percent" | "always_review";
  revision: number; state: "rank_review" | "rank_rejected";
  review_note: string | null; rejection_reason: RankedUploadReason | null; rejection_rules: ExerciseRule[];
};
const uuid = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown, max = 1000): value is string => typeof value === "string" && value.length <= max;
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const nullableText = (value: unknown, max = 1000) => value === null || text(value, max);
const lines = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 50 && value.every(line => text(line, 2000));
const reason = (value: unknown): value is RankedUploadReason => typeof value === "string" && Object.hasOwn(rankedUploadReasons, value);

/** Only review fields are returned to the browser; future RPC additions stay private. */
export function parseRankedUploadReviews(value: unknown): RankedUploadReview[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Review queue unavailable");
  return value.map(raw => {
    if (!raw || typeof raw !== "object") throw new Error("Review queue unavailable");
    const item = raw as RankedUploadReview;
    const g = item.guidelines;
    if (!uuid(item.id) || !uuid(item.owner_id) || !text(item.post_id, 128) || !item.post_id ||
      !text(item.title) || !text(item.username, 100) || !text(item.created_at, 80) || !Number.isFinite(Date.parse(item.created_at)) ||
      !text(item.board_id, 128) || !item.board_id || !text(item.board_name, 300) || !text(item.exercise_name, 300) ||
      !nullableText(item.progression, 200) || !["reps", "seconds"].includes(item.metric) ||
      typeof item.claim !== "number" || !Number.isFinite(item.claim) || item.claim <= 0 ||
      ![item.projected_rank, item.participants, item.cutoff].every(v => v === null || integer(v)) ||
      typeof item.top_percent !== "number" || !Number.isFinite(item.top_percent) || item.top_percent < 0 || item.top_percent > 100 ||
      typeof item.always_require_review !== "boolean" || !["top_percent", "always_review"].includes(item.reason) ||
      !integer(item.revision, 1) || !["rank_review", "rank_rejected"].includes(item.state) ||
      !nullableText(item.review_note, 1000) || !(item.rejection_reason === null || reason(item.rejection_reason)) ||
      !g || !text(g.board_id, 128) ||
      !text(g.form_standard, 10000) || !text(g.camera_standard, 10000) || !lines(g.form_checkpoints) ||
      !nullableText(g.counting_standard, 10000) || !lines(g.common_mistakes) ||
      !nullableText(g.demo_caption, 2000)) {
      throw new Error("Review queue unavailable");
    }
    const timing = item.hold_timing;
    if (timing !== undefined && timing !== null && (item.metric !== "seconds" ||
      typeof timing !== "object" || !integer(timing.start_ms) || !integer(timing.end_ms) ||
      timing.end_ms > 2147483647 || !integer(timing.duration_ms, 1000) ||
      timing.end_ms - timing.start_ms !== timing.duration_ms ||
      Math.floor(timing.duration_ms / 1000) !== item.claim)) {
      throw new Error("Review queue unavailable");
    }
    return {
      ...(timing ? {hold_timing: {start_ms: timing.start_ms, end_ms: timing.end_ms,
        duration_ms: timing.duration_ms}} : {}),
      id: item.id, owner_id: item.owner_id, post_id: item.post_id, title: item.title,
      username: item.username, created_at: item.created_at, board_id: item.board_id,
      board_name: item.board_name, exercise_name: item.exercise_name, progression: item.progression,
      metric: item.metric, claim: item.claim, projected_rank: item.projected_rank,
      participants: item.participants, cutoff: item.cutoff, top_percent: item.top_percent,
      always_require_review: item.always_require_review, reason: item.reason,
      revision: item.revision, state: item.state, review_note: item.review_note,
      rejection_reason: item.rejection_reason, rejection_rules: parseExerciseRules(item.rejection_rules ?? []),
      guidelines: { board_id: g.board_id, form_standard: g.form_standard,
        camera_standard: g.camera_standard, form_checkpoints: [...g.form_checkpoints],
        counting_standard: g.counting_standard, common_mistakes: [...g.common_mistakes],
        demo_caption: g.demo_caption, rules: parseExerciseRules(g.rules) },
    };
  });
}
export function parseRankedUploadDecision(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  const ruleIds = parseRuleIds(d.rule_ids ?? []);
  const note = d.review_note ?? "";
  if (!ruleIds || !uuid(d.upload_id) || !integer(d.expected_revision, 1) || typeof d.approve !== "boolean" ||
    !text(note, 1000) || (d.watched_video !== undefined && typeof d.watched_video !== "boolean") ||
    (d.approve ? d.watched_video !== true || (d.reason_code !== null && d.reason_code !== undefined) || ruleIds.length > 0
      : !reason(d.reason_code))) return null;
  if (ruleIds.length && !["unacceptable_form", "unacceptable_filming"].includes(d.reason_code as string)) return null;
  return { upload_id: d.upload_id, expected_revision: d.expected_revision,
    approve: d.approve, watched_video: d.watched_video === true,
    reason_code: d.approve ? null : d.reason_code as RankedUploadReason,
    review_note: note.trim(), rule_ids: ruleIds };

}
export function parseRankedUploadPreview(value: unknown): string | null {
  const id = value && typeof value === "object" ? (value as Record<string, unknown>).upload_id : null;
  return uuid(id) ? id : null;
}
export function parsePrivateRankedPreview(value: unknown): {url: string; expires_in: number} | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (!text(result.url, 8192) || !integer(result.expires_in, 1) || result.expires_in > 600) return null;
  try {
    const url = new URL(result.url);
    // AWS signs R2 downloads in either path-style or bucket-hosted form.
    // Only the private staging bucket is allowed as a hostname prefix.
    if (url.protocol !== "https:" || !/^(?:zelos-supabase-staging\.)?[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/i.test(url.hostname) ||
      url.username || url.password || url.port || url.hash) return null;
    return { url: result.url, expires_in: result.expires_in };
  } catch { return null; }
}
