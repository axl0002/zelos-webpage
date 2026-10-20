import {parseRuleIds, type ExerciseRule} from "./exercise-rules";
export type RankingFlag = {
  id: string; post_id: string; reason: string; details: string;
  corrected_value: number | null; reported_value: number | null;
  metric: string | null; rule_violations: ExerciseRule[]; rules: ExerciseRule[];
  claimed_value: number; board_name: string; board_metric: string;
  username: string; title: string; created_at: string; submission_status: string;
  primary_url: string | null; renditions: Record<string, string> | null; review_unavailable?: boolean;
  reported_hold_start_ms?: number | null; reported_hold_end_ms?: number | null;
  hold_timing?: {start_ms: number; end_ms: number; duration_ms: number} | null;
};
export const rankingReasons: Record<string, string> = {
  incorrect_exercise: "Incorrect exercise or progression",
  incorrect_measurement: "Incorrect hold time or rep count",
  unacceptable_form: "Unacceptable form",
  unacceptable_filming: "Filming rules not met",
  incorrect_start_frame: "Incorrect hold start frame",
  incorrect_end_frame: "Incorrect hold end frame",
  incorrect_hold_frames: "Incorrect hold start and end frames",
};
export function rankingFlagHoldTiming(item: RankingFlag) {
  if ((item.metric ?? item.board_metric) !== "seconds") return null;
  // The report snapshot is the evidence the athlete flagged. Do not replace it
  // with current post metadata if a later backend change updates the timings.
  const snapshot = item.reported_hold_start_ms != null || item.reported_hold_end_ms != null;
  if (["incorrect_start_frame", "incorrect_end_frame", "incorrect_hold_frames"].includes(item.reason) && !snapshot) return null;
  const start = snapshot ? item.reported_hold_start_ms : item.hold_timing?.start_ms;
  const end = snapshot ? item.reported_hold_end_ms : item.hold_timing?.end_ms;
  if (typeof start !== "number" || typeof end !== "number" ||
    !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 ||
    end > 2147483647 || end - start < 1000) return null;
  return {start_ms: start, end_ms: end, duration_ms: end - start, snapshot};
}
export function parseRankingFlagDecision(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  const ruleIds = parseRuleIds(d.rule_ids);
  if (!ruleIds || (!d.confirmed && ruleIds.length > 0) || typeof d.report_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.report_id) ||
    typeof d.confirmed !== "boolean" || typeof d.watched_video !== "boolean" || (d.confirmed && d.watched_video !== true) || typeof d.review_note !== "string" ||
    d.review_note.length > 1000 || (d.confirmed && d.review_note.trim().length < 3 && ruleIds.length === 0)) return null;
  return { report_id: d.report_id, confirmed: d.confirmed,
    review_note: d.review_note.trim(), watched_video: d.watched_video, rule_ids: ruleIds };
}
