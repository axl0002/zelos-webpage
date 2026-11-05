export type InstagramAdoption = {
  schema_version: 1; cohort_start: string; generated_at: string;
  signed_in_accounts: number; with_instagram: number; without_instagram: number; unanswered: number;
};
/** Strip all non-contract fields before aggregates reach the browser. */
export function parseInstagramAdoption(value: unknown): InstagramAdoption {
  const invalid = (): never => {throw new Error("Instagram adoption unavailable");};
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const source = value as Record<string, unknown>;
  const timestamp = (v: unknown): v is string => typeof v === "string" && v.length <= 64 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
  if (source.schema_version !== 1 || !timestamp(source.cohort_start) || Date.parse(source.cohort_start) !== Date.parse("2026-10-22T00:00:00Z") || !timestamp(source.generated_at) || Date.parse(source.generated_at) < Date.parse(source.cohort_start)) return invalid();
  const count = (v: unknown): number => Number.isSafeInteger(v) && (v as number) >= 0 ? v as number : invalid();
  const total = count(source.signed_in_accounts), added = count(source.with_instagram), declined = count(source.without_instagram), unanswered = count(source.unanswered);
  if (!Number.isSafeInteger(added + declined + unanswered) || total !== added + declined + unanswered) return invalid();
  return {schema_version: 1, cohort_start: source.cohort_start, generated_at: source.generated_at, signed_in_accounts: total, with_instagram: added, without_instagram: declined, unanswered};
}
