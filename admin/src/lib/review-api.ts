import { NextRequest, NextResponse } from "next/server";
import type { Decision } from "./review-types";
export function checkMutation(request: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_ORIGIN || request.nextUrl.origin;
  if (
    request.headers.get("origin") !== expected ||
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return NextResponse.json(
      { error: "Invalid request origin or content type." },
      { status: 403 },
    );
  }
  return null;
}
export function parseDecision(value: unknown): Decision | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Decision;
  if (
    typeof d.post_id !== "string" ||
    !d.post_id ||
    d.post_id.length > 200 ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 1 ||
    !["approve", "skip"].includes(d.decision) ||
    typeof d.note !== "string" ||
    d.note.length > 1000 ||
    typeof d.watched !== "boolean" ||
    typeof d.replace_current !== "boolean"
  )
    return null;
  if (
    d.decision === "approve" &&
    (typeof d.board_id !== "string" ||
      !d.board_id ||
      !Number.isSafeInteger(d.value) ||
      d.value! < 1 ||
      !d.watched)
  )
    return null;
  if (
    d.decision === "skip" &&
    (d.board_id !== null ||
      d.value !== null ||
      d.replace_current)
  )
    return null;
  return d;
}
export function rpcFailure(error: { code?: string; message?: string }) {
  const messages: Record<string, string> = {
    review_conflict:
      "Someone already reviewed or updated this clip. Refresh the queue.",
    candidate_changed_rescan:
      "The clip changed since scanning. Scan again before approving.",
    candidate_unavailable: "This clip is no longer eligible for review.",
    invalid_measurement:
      "Choose an active progression and enter a valid whole-number result.",
    hold_too_short:
      "The video must be at least one second longer than the claimed hold.",
    video_review_required: "Confirm that you watched and checked the clip.",
    invalid_decision: "Check the review details and try again.",
    assisted_exercise_not_eligible:
      "This clip mentions assistance and is not eligible for ranking. Scan the queue to apply the automatic rejection.",
    ranking_keywords_not_eligible:
      "This clip mentions bad form or added weight and is not eligible for ranking. Scan the queue to apply the automatic rejection.",
    admin_required: "This account does not have admin access.",
  };
  return NextResponse.json(
    {
      error:
        messages[error.message || ""] ||
        "The review could not be saved. Your inputs are still here; try again.",
    },
    {
      status:
        error.code === "42501"
          ? 403
          : error.code === "40001"
            ? 409
            : error.code === "22023"
              ? 400
              : 503,
    },
  );
}
