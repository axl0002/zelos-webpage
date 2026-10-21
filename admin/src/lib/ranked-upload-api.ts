import { NextResponse } from "next/server";
export function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export function rankedUploadFailure(error?: {code?: string; message?: string}) {
  const messages: Record<string, string> = {
    rank_review_conflict: "This upload changed or was already reviewed. Refresh the queue before deciding.",
    review_conflict: "This upload changed or was already reviewed. Refresh the queue before deciding.",
    rank_review_unavailable: "This upload is no longer awaiting a ranking review. Refresh the queue.",
    review_unavailable: "This upload is no longer awaiting a ranking review. Refresh the queue.",
    video_review_required: "Confirm that you watched the full video before approving.",
    invalid_decision: "Select a valid rejection reason.",
    invalid_rule_choices: "These rules changed. Refresh the queue and select the rules again.",
    hold_too_long: "This hold video is more than 6 seconds longer than the claim. Reject it and ask the uploader to trim it in the app and upload again.",
    hold_too_short: "This video does not cover the claimed hold plus 1 extra second. Check the claim; reject it and request a complete clip if the timing is incorrect.",
    admin_required: "This account does not have admin access.",
  };
  return privateResponse(NextResponse.json({error: messages[error?.message ?? ""] ||
    "The review could not finish. Your inputs are still here; try again."},
    {status: error?.code === "42501" ? 403 : error?.code === "40001" ? 409 : error?.code === "22023" ? 400 : 503}));
}
