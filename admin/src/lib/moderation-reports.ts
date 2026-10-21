import { mediaUrls } from "./review-media";

export type ReportEvidence = {
  id: string; reason: string; details: string; created_at: string;
  timestamp_ms: number | null;
  answers_snapshot: { category?: { label: string }; options: { label: string }[]; locations: { label: string }[] };
};
export type ModerationReport = {
  id: string; target_kind: "post" | "comment" | "profile"; target_id: string;
  state: "open" | "confirmed" | "dismissed"; created_at: string;
  report_count: number; revision: number; decision_note: string | null; auto_hidden: boolean;
  reports: ReportEvidence[]; context: { username: string; body: string; post_id?: string;
    post_state?: string; owner_banned?: boolean; owner_manual_ban?: boolean;
    can_hide?: boolean; can_restore?: boolean; can_delete?: boolean; can_ban?: boolean } | null;
};
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const text = (v: unknown, max = 10000): v is string => typeof v === "string" && v.length <= max;
export const reportId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
function labels(v: unknown): {label: string}[] {
  if (!Array.isArray(v)) return [];
  return v.filter(item => object(item) && text(item.label, 2000)).map(item => ({label: item.label}));
}

/** Allowlist review evidence; reporter identities and internal owner data stay server-side. */
export function parseModerationReports(value: unknown): ModerationReport[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Reports unavailable");
  return value.map(raw => {
    const v = object(raw);
    if (!v || !reportId(v.id) || !["post", "comment", "profile"].includes(String(v.target_kind)) ||
      !text(v.target_id, 128) || !v.target_id || !["open", "confirmed", "dismissed"].includes(String(v.state)) ||
      !text(v.created_at, 80) || !Number.isFinite(Date.parse(v.created_at)) ||
      !Number.isSafeInteger(v.report_count) || (v.report_count as number) < 0 ||
      !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || !Array.isArray(v.reports)) throw new Error("Reports unavailable");
    const context = object(v.context);
    return {
      id: v.id, target_id: v.target_id, target_kind: v.target_kind as ModerationReport["target_kind"],
      state: v.state as ModerationReport["state"], created_at: v.created_at,
      auto_hidden: v.auto_hidden === true, report_count: v.report_count as number, revision: v.revision as number,
      decision_note: text(v.decision_note, 2000) ? v.decision_note : null,
      context: context && text(context.username, 100) && text(context.body)
        ? {username: context.username, body: context.body, ...(text(context.post_id, 128) ? {post_id: context.post_id} : {}),
          ...(text(context.post_state, 50) ? {post_state: context.post_state} : {}),
          owner_banned: context.owner_banned === true, owner_manual_ban: context.owner_manual_ban === true,
          can_hide: context.can_hide === true, can_restore: context.can_restore === true,
          can_delete: context.can_delete === true, can_ban: context.can_ban === true} : null,
      reports: v.reports.map(rawReport => {
        const r = object(rawReport);
        if (!r || !reportId(r.id) || !text(r.reason, 1000) || !text(r.created_at, 80)) throw new Error("Reports unavailable");
        const snapshot = object(r.answers_snapshot), category = object(snapshot?.category);
        return {id: r.id, reason: r.reason, details: text(r.details, 1000) ? r.details : "", created_at: r.created_at,
          timestamp_ms: Number.isSafeInteger(r.timestamp_ms) && (r.timestamp_ms as number) >= 0 ? r.timestamp_ms as number : null,
          answers_snapshot: {...(category && text(category.label, 2000) ? {category: {label: category.label}} : {}),
            options: labels(snapshot?.options), locations: labels(snapshot?.locations)}};
      }),
    };
  });
}
export function parseModerationDecision(value: unknown) {
  const v = object(value);
  if (!v || !reportId(v.case_id) || !Number.isSafeInteger(v.expected_revision) || (v.expected_revision as number) < 1 || typeof v.confirmed !== "boolean" || v.reviewed_content !== true ||
    !text(v.decision_note, 2000) || (v.confirmed && v.decision_note.trim().length < 3)) return null;
  return {target_case: v.case_id, expected_revision: v.expected_revision as number, confirmed: v.confirmed, decision_note: v.decision_note.trim()};
}
export function parseReportPreview(value: unknown) {
  const v = object(value), media = object(v?.media), author = object(v?.author);
  if (!v || !media || !text(v.title, 1000) || !text(v.caption) || !text(media.primary_url, 8192)) return null;
  const renditions = object(v.renditions) ?? {};
  const urls = mediaUrls({primary_url: media.primary_url,
    renditions: Object.fromEntries(Object.entries(renditions).filter((pair): pair is [string, string] => text(pair[1], 8192)))});
  return {title: v.title, caption: v.caption, username: author && text(author.username, 100) ? author.username : "", urls};
}
