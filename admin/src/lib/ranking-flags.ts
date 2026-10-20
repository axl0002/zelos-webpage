import {parseRuleIds, type ExerciseRule} from "./exercise-rules";
export type RankingFlag = {
  id: string; post_id: string; reason: string; details: string;
  corrected_value: number | null; reported_value: number | null;
  metric: string | null; rule_violations: ExerciseRule[]; rules: ExerciseRule[];
  claimed_value: number; board_name: string; board_metric: string;
  username: string; title: string; created_at: string; submission_status: string;
  primary_url: string; renditions: Record<string, string>;
};
export const rankingReasons: Record<string, string> = {
  incorrect_exercise: "Incorrect exercise or progression",
  incorrect_measurement: "Incorrect hold time or rep count",
  unacceptable_form: "Unacceptable form",
  unacceptable_filming: "Filming rules not met",
};
export function parseRankingFlagDecision(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  const ruleIds = parseRuleIds(d.rule_ids);
  if (!ruleIds || (!d.confirmed && ruleIds.length > 0) || typeof d.report_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.report_id) ||
    typeof d.confirmed !== "boolean" || d.watched_video !== true || typeof d.review_note !== "string" ||
    d.review_note.length > 1000 || (d.confirmed && d.review_note.trim().length < 3 && ruleIds.length === 0)) return null;
  return { report_id: d.report_id, confirmed: d.confirmed,
    review_note: d.review_note.trim(), watched_video: true, rule_ids: ruleIds };
}
