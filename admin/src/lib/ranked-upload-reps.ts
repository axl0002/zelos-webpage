export type RankedUploadRepContext = {
  upload_id: string; revision: number; source_fingerprint: string; max_value: number; claim: number;
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const integer = (v: unknown, max = 2147483647): v is number => Number.isSafeInteger(v) && Number(v) >= 1 && Number(v) <= max;
const fingerprint = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
export function repUploadId(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 1) return null;
  const id = (v as Record<string, unknown>).upload_id;
  return uuid(id) ? id : null;
}
export function parseRankedUploadRepContext(v: unknown): RankedUploadRepContext | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  if (!uuid(c.upload_id) || !integer(c.revision) || !fingerprint(c.source_fingerprint) || !integer(c.max_value) || !integer(c.claim, c.max_value)) return null;
  return {upload_id: c.upload_id, revision: c.revision, source_fingerprint: c.source_fingerprint, max_value: c.max_value, claim: c.claim};
}
export function parseRankedUploadRepCorrection(v: unknown) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const keys = ['upload_id', 'expected_revision', 'expected_source_fingerprint', 'corrected_value', 'watched_video', 'review_note'];
  if (Object.keys(d).length !== keys.length || keys.some(k => !(k in d)) || !uuid(d.upload_id) || !integer(d.expected_revision) ||
    !fingerprint(d.expected_source_fingerprint) || !integer(d.corrected_value) || d.watched_video !== true ||
    typeof d.review_note !== 'string' || d.review_note.length > 1000 || d.review_note.trim().length < 3) return null;
  return {upload_id: d.upload_id, expected_revision: d.expected_revision, expected_source_fingerprint: d.expected_source_fingerprint,
    corrected_value: d.corrected_value, watched_video: true, review_note: d.review_note.trim()};
}
