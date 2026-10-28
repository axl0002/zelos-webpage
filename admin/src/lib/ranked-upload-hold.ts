export type RankedUploadHoldContext = {
  upload_id: string; revision: number; source_fingerprint: string; duration_ms: number;
  max_value: number; claim: number; hold_timing: {start_ms: number; end_ms: number; duration_ms: number} | null;
};
const id = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const integer = (v: unknown, min: number, max = 2147483647): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
export function holdUploadId(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const upload = (v as Record<string, unknown>).upload_id;
  return id(upload) ? upload : null;
}
export function parseRankedUploadHoldContext(v: unknown): RankedUploadHoldContext | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const c = v as RankedUploadHoldContext;
  if (!id(c.upload_id) || !integer(c.revision, 1) || typeof c.source_fingerprint !== 'string' || !/^[a-f0-9]{32}$/.test(c.source_fingerprint) ||
    !integer(c.duration_ms, 1, 180000) || !integer(c.max_value, 1) || !integer(c.claim, 1, c.max_value)) return null;
  if (c.hold_timing !== null) {
    const t = c.hold_timing;
    if (!t || !integer(t.start_ms, 0) || !integer(t.end_ms, 1, c.duration_ms) || !integer(t.duration_ms, 1000) ||
      t.end_ms - t.start_ms !== t.duration_ms || Math.floor(t.duration_ms / 1000) !== c.claim) return null;
  }
  return {upload_id: c.upload_id, revision: c.revision, source_fingerprint: c.source_fingerprint, duration_ms: c.duration_ms,
    max_value: c.max_value, claim: c.claim, hold_timing: c.hold_timing};
}
export function parseRankedUploadHoldCorrection(v: unknown) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const keys = ['upload_id','expected_revision','expected_source_fingerprint','hold_start_ms','hold_end_ms','watched_video','review_note'];
  if (Object.keys(d).length !== keys.length || keys.some(k => !(k in d)) || !id(d.upload_id) || !integer(d.expected_revision, 1) ||
    typeof d.expected_source_fingerprint !== 'string' || !/^[a-f0-9]{32}$/.test(d.expected_source_fingerprint) ||
    !integer(d.hold_start_ms, 0, 180000) || !integer(d.hold_end_ms, 1, 180000) || d.hold_end_ms - d.hold_start_ms < 1000 ||
    d.watched_video !== true || typeof d.review_note !== 'string' || d.review_note.length > 1000 || d.review_note.trim().length < 3) return null;
  return {upload_id: d.upload_id, expected_revision: d.expected_revision, expected_source_fingerprint: d.expected_source_fingerprint,
    hold_start_ms: d.hold_start_ms, hold_end_ms: d.hold_end_ms, watched_video: true, review_note: d.review_note.trim()};
}

/** Bound untrusted JSON even for chunked requests without Content-Length. */
export async function readHoldCommand(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > 8192) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const decoder = new TextDecoder(); let raw = '', size = 0;
  while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 8192) {await reader.cancel(); return null;}
    raw += decoder.decode(value, {stream: true});
  }
  try {return JSON.parse(raw + decoder.decode());} catch {return null;}
}
