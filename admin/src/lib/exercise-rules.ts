export type ExerciseRule = {id: string; type: "form" | "filming"; text: string; position: number};
export const ruleUuid = (value: unknown): value is string => typeof value === "string" &&
  // Rule IDs include deterministic hash-derived PostgreSQL UUIDs. Their version
  // and variant bits are not constrained; the backend checks rule membership.
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export function parseRuleIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) && value.length <= 8 && value.every(ruleUuid) && new Set(value).size === value.length
    ? [...value] : null;
}
export function parseExerciseRules(value: unknown): ExerciseRule[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Exercise rules unavailable");
  return value.map(raw => {
    if (!raw || typeof raw !== "object" || !ruleUuid(raw.id) || !["form", "filming"].includes(raw.type) ||
      typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > 6000 ||
      (raw.position !== undefined && (!Number.isSafeInteger(raw.position) || raw.position < 0))) {
      throw new Error("Exercise rules unavailable");
    }
    return {id: raw.id, type: raw.type, text: raw.text, position: raw.position ?? 0};
  });
}
