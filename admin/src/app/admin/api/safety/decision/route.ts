import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation, rpcFailure } from "@/lib/review-api";
import { parseSafetyDecision } from "@/lib/safety-review";

export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return invalid;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const decision = parseSafetyDecision(await request.json().catch(() => null));
  if (!decision)
    return NextResponse.json(
      { error: "Check the decision and add a reason when rejecting." },
      { status: 400 },
    );
  const { error } = await auth.client.rpc("resolve_upload_review", decision);
  return error ? rpcFailure(error) : NextResponse.json({ ok: true });
}
