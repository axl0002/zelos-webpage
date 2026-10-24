import {parseRuleIds, type ExerciseRule} from "./exercise-rules";
import {rankedReviewReasons} from "./ranked-review-reasons";
export type RankingFlag = {
  id: string; post_id: string; reason: string; details: string;
  corrected_value: number | null; reported_value: number | null;
  metric: string | null; rule_violations: ExerciseRule[]; rules: ExerciseRule[];
  claimed_value: number; board_name: string; board_metric: string;
  username: string; reporter_username?: string | null; title: string; created_at: string; submission_status: string;
  primary_url: string | null; renditions: Record<string, string> | null; review_unavailable?: boolean;
  reported_hold_start_ms?: number | null; reported_hold_end_ms?: number | null;
  submission_id?:string; measurement_revision?:number; media_fingerprint?:string; duration_ms?:number|null; max_value?:number;
  suggested_hold_start_ms?:number|null; suggested_hold_end_ms?:number|null; reported_measurement_revision?:number|null;
  hold_timing?: {start_ms: number; end_ms: number; duration_ms: number} | null;
};
export const rankingReasons: Record<string, string> = rankedReviewReasons;
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

export function parseRankingFlagCorrection(value:unknown){
 if(!value||typeof value!=="object"||Array.isArray(value))return null;const v=value as Record<string,unknown>;
 const keys=["report_id","expected_revision","expected_media_fingerprint","corrected_value","hold_start_ms","hold_end_ms","reviewed_duration_ms","watched_video","review_note"];
 if(Object.keys(v).length!==keys.length||keys.some(k=>!(k in v))||typeof v.report_id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.report_id)||!Number.isSafeInteger(v.expected_revision)||(v.expected_revision as number)<0||typeof v.expected_media_fingerprint!=="string"||!/^[a-f0-9]{32}$/.test(v.expected_media_fingerprint)||!Number.isSafeInteger(v.corrected_value)||(v.corrected_value as number)<1||(v.corrected_value as number)>2147483647||v.watched_video!==true||typeof v.review_note!=="string"||v.review_note.trim().length<3||v.review_note.length>1000)return null;
 for(const k of ["hold_start_ms","hold_end_ms","reviewed_duration_ms"])if(v[k]!==null&&(!Number.isSafeInteger(v[k])||(v[k] as number)<0||(v[k] as number)>180000))return null;
 if((v.hold_start_ms===null)!==(v.hold_end_ms===null))return null;
 if(v.hold_start_ms!==null&&((v.hold_end_ms as number)-(v.hold_start_ms as number)<1000||Math.floor(((v.hold_end_ms as number)-(v.hold_start_ms as number))/1000)!==v.corrected_value))return null;
 if(v.hold_start_ms===null&&v.reviewed_duration_ms!==null)return null;
 return {report_id:v.report_id,expected_revision:v.expected_revision as number,expected_media_fingerprint:v.expected_media_fingerprint,corrected_value:v.corrected_value as number,hold_start_ms:v.hold_start_ms as number|null,hold_end_ms:v.hold_end_ms as number|null,reviewed_duration_ms:v.reviewed_duration_ms as number|null,watched_video:true,review_note:v.review_note.trim()};
}
