import { reportId } from "./moderation-reports";

export type AdminUser = {
  id: string; username: string; country: string | null; is_banned: boolean;
  manual_ban: boolean; ban_until: string | null; can_ban: boolean; can_unban: boolean; revision: number;
};
export function parseAdminUsers(value: unknown): AdminUser[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Users unavailable");
  return value.map(v => {
    if (!v || !reportId(v.id) || typeof v.username !== "string" || v.username.length > 100 ||
      typeof v.is_banned !== "boolean" || typeof v.manual_ban !== "boolean" ||
      !Number.isSafeInteger(v.revision) || v.revision < 0) throw new Error("Users unavailable");
    return {id: v.id, username: v.username, country: typeof v.country === "string" ? v.country.slice(0, 100) : null,
      is_banned: v.is_banned, manual_ban: v.manual_ban, ban_until: typeof v.ban_until === "string" ? v.ban_until : null,
      can_ban: v.can_ban === true, can_unban: v.can_unban === true, revision: v.revision};
  });
}
export function parseBan(value: unknown) {
  const v = value as Record<string, unknown> | null;
  if (!v || !reportId(v.user_id) || !reportId(v.request_id) || typeof v.banned !== "boolean" ||
    !Number.isSafeInteger(v.expected_revision) || (v.expected_revision as number) < 0 ||
    typeof v.reason !== "string" || v.reason.trim().length < 3 || v.reason.length > 1000) return null;
  return {target_user: v.user_id, banned: v.banned, expected_revision: v.expected_revision as number, reason: v.reason.trim(), request_id: v.request_id};
}
export function parseReportAction(value: unknown) {
  const v = value as Record<string, unknown> | null;
  if (!v || !reportId(v.case_id) || !reportId(v.request_id) ||
    !Number.isSafeInteger(v.expected_revision) || (v.expected_revision as number) < 1 ||
    !["hide", "restore", "delete", "ban"].includes(String(v.action)) ||
    typeof v.reason !== "string" || v.reason.trim().length < 3 || v.reason.length > 1000) return null;
  return {target_case: v.case_id, expected_revision: v.expected_revision as number, action: v.action as string,
    reason: v.reason.trim(), request_id: v.request_id};
}
