export type AdminReviewCounts = {
  user_reports: number; current_reports: number; legacy_reports: number;
  ranking_flags: number; ranked_uploads: number;
};
const fields = ["user_reports", "current_reports", "legacy_reports", "ranking_flags", "ranked_uploads"] as const;
export function parseAdminReviewCounts(value: unknown): AdminReviewCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Review counts unavailable");
  const v = value as Record<string, unknown>;
  for (const field of fields) if (!Number.isSafeInteger(v[field]) || (v[field] as number) < 0) throw new Error("Review counts unavailable");
  if (v.user_reports !== (v.current_reports as number) + (v.legacy_reports as number)) throw new Error("Review counts unavailable");
  return Object.fromEntries(fields.map(field => [field, v[field]])) as AdminReviewCounts;
}
export type AdminReviewCountsV2 = AdminReviewCounts & {upload_safety: number};
export function parseAdminReviewCountsV2(value: unknown): AdminReviewCountsV2 {
  const legacy = parseAdminReviewCounts(value);
  const safety = (value as Record<string, unknown>).upload_safety;
  if (!Number.isSafeInteger(safety) || (safety as number) < 0) throw new Error("Review counts unavailable");
  return {...legacy, upload_safety: safety as number};
}
export const reviewCountsChanged = "zelos:admin-review-counts-changed";
/** Called only after a successful moderation mutation, never a preview. */
export function notifyAdminReviewCountsChanged() {
  window.dispatchEvent(new Event(reviewCountsChanged));
}
