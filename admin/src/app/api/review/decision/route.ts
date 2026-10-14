import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation, parseDecision, rpcFailure } from "@/lib/review-api";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return invalid;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = parseDecision(await request.json().catch(() => null));
  if (!body)
    return NextResponse.json(
      { error: "Check the exercise, result and review confirmation." },
      { status: 400 },
    );
  const { data, error } = await auth.client.rpc("admin_decide_rank_candidate", {
    target_post: body.post_id,
    expected_revision: body.revision,
    decision: body.decision,
    selected_board: body.board_id,
    measured_value: body.value,
    review_note: body.note,
    watched_video: body.watched,
    replace_current: body.replace_current,
  });
  return error ? rpcFailure(error) : NextResponse.json(data);
}
