import { reportId } from "./moderation-reports";
export type LegacyReport = {
  id: string; target_kind: "post" | "profile" | "comment"; target_id: string | null;
  state: "open" | "reviewed" | "dismissed"; revision: number; created_at: string;
  reason: string; details: string; username: string; body: string | null;
  review_note: string | null; reporter_available: boolean; target_available: boolean; can_ban: boolean;
};
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
export function parseLegacyReports(value: unknown): LegacyReport[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Legacy reports unavailable");
  return value.map(raw => {
    const v = object(raw);
    if (!v || !reportId(v.id) || !["post", "profile", "comment"].includes(String(v.target_kind)) ||
      !["open", "reviewed", "dismissed"].includes(String(v.state)) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1 ||
      !text(v.created_at, 80) || !Number.isFinite(Date.parse(v.created_at)) || !text(v.reason, 1000) || !text(v.details, 10000) || !text(v.username, 100) ||
      !(v.target_id === null || text(v.target_id, 128))) throw new Error("Legacy reports unavailable");
    return {id: v.id, target_kind: v.target_kind as LegacyReport["target_kind"], target_id: v.target_id,
      state: v.state as LegacyReport["state"], revision: Number(v.revision), created_at: v.created_at,
      reason: v.reason, details: v.details, username: v.username, body: text(v.body, 10000) ? v.body : null,
      review_note: text(v.review_note, 2000) ? v.review_note : null, reporter_available: v.reporter_available === true,
      target_available: v.target_available === true, can_ban: v.can_ban === true};
  });
}
export function parseLegacyDecision(value: unknown) {
  const v = object(value);
  if (!v || !reportId(v.report_id) || !Number.isSafeInteger(v.expected_revision) || Number(v.expected_revision) < 1 ||
    !["reviewed", "dismissed"].includes(String(v.decision)) || v.reviewed_evidence !== true || !text(v.note, 2000) || v.note.trim().length < 3) return null;
  return {target_report: v.report_id, expected_revision: Number(v.expected_revision), decision: String(v.decision), review_note: v.note.trim()};
}
export function parseLegacyBan(value: unknown) {
  const v = object(value);
  if (!v || !reportId(v.report_id) || !reportId(v.request_id) || !Number.isSafeInteger(v.expected_revision) || Number(v.expected_revision) < 1 ||
    !text(v.reason, 1000) || v.reason.trim().length < 3 || !(v.duration_days === null || (Number.isSafeInteger(v.duration_days) && Number(v.duration_days) >= 1 && Number(v.duration_days) <= 3650))) return null;
  return {target_report: v.report_id, expected_revision: Number(v.expected_revision), reason: v.reason.trim(), request_id: v.request_id, duration_days: v.duration_days as number | null};
}
