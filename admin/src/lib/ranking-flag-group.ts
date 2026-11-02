import {parseRankingFlagDecision} from "./ranking-flags";
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length >= 1 && value.length <= 1000 && value.every(uuid) && new Set(value.map(id => id.toLowerCase())).size === value.length;
export type RankingFlagGroupContext = {report_id: string; submission_id: string; open_report_ids: string[]; other_open_count: number};
export type RankingFlagGroupResult = {ok: true; status: "confirmed" | "dismissed"; resolved_report_ids: string[]; resolved_count: number; other_resolved_count: number};
export function rankingFlagId(value: unknown): string | null {return uuid(value) ? value.toLowerCase() : null;}
export function parseRankingFlagGroupContext(value: unknown, reportId: string): RankingFlagGroupContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as RankingFlagGroupContext;
  if (c.report_id !== reportId || !uuid(c.submission_id) || !ids(c.open_report_ids) || !c.open_report_ids.includes(reportId) || c.other_open_count !== c.open_report_ids.length - 1) return null;
  return {report_id: c.report_id, submission_id: c.submission_id, open_report_ids: [...c.open_report_ids], other_open_count: c.other_open_count};
}
export function parseRankingFlagGroupDecision(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  const keys = ["report_id", "expected_open_report_ids", "confirmed", "review_note", "watched_video", "rule_ids"];
  if (Object.keys(d).length !== keys.length || keys.some(key => !(key in d))) return null;
  const decision = parseRankingFlagDecision(d);
  if (!decision || !ids(d.expected_open_report_ids) || !d.expected_open_report_ids.includes(decision.report_id)) return null;
  return {...decision, report_id: decision.report_id.toLowerCase(), expected_open_report_ids: d.expected_open_report_ids.map(id => id.toLowerCase())};
}
export function parseRankingFlagGroupResult(value: unknown, expectedIds: string[], confirmed: boolean): RankingFlagGroupResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as RankingFlagGroupResult;
  if (r.ok !== true || r.status !== (confirmed ? "confirmed" : "dismissed") || !ids(r.resolved_report_ids) || r.resolved_count !== expectedIds.length || r.other_resolved_count !== expectedIds.length - 1 || r.resolved_report_ids.length !== expectedIds.length || r.resolved_report_ids.some(id => !expectedIds.includes(id))) return null;
  return {ok: true, status: r.status, resolved_report_ids: [...r.resolved_report_ids], resolved_count: r.resolved_count, other_resolved_count: r.other_resolved_count};
}
export async function readRankingFlagGroupCommand(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 65536) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const decoder = new TextDecoder(); let raw = "", size = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 65536) {await reader.cancel(); return null;}
    raw += decoder.decode(value, {stream: true});
  }
  try {return JSON.parse(raw + decoder.decode());} catch {return null;}
}
