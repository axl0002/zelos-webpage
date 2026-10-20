export type SafetyFrame = {
  time_ms: number;
  labels: { name: string; parent: string | null; confidence: number }[];
};

export type SafetyCase = {
  id: string;
  owner_id: string;
  post_id: string | null;
  title: string | null;
  created_at: string;
  state?: "review" | "rejected" | "failed";
  error_code?: string | null;
  review_note?: string | null;
  evidence: {
    provider?: string;
    frame_count?: number;
    interval_seconds?: number | null;
    frames?: SafetyFrame[];
  } | null;
};

export function parseSafetyDecision(value: unknown): {
  upload_id: string;
  approve: boolean;
  review_note: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.upload_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.upload_id) ||
    typeof v.approve !== "boolean" ||
    typeof v.review_note !== "string" ||
    v.review_note.length > 2000 ||
    v.approve === false && !v.review_note.trim()
  ) return null;
  return { upload_id: v.upload_id, approve: v.approve, review_note: v.review_note.trim() };
}

export function parseSafetyPreview(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const uploadId = (value as Record<string, unknown>).upload_id;
  return parseSafetyDecision({ upload_id: uploadId, approve: true, review_note: "" })?.upload_id ?? null;
}
