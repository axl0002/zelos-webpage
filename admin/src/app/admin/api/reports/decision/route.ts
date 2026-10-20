import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { checkMutation, rpcFailure } from "@/lib/review-api";
import { privateResponse } from "@/lib/ranked-upload-api";
import { parseModerationDecision } from "@/lib/moderation-reports";
export async function POST(request: NextRequest) {
  const invalid = checkMutation(request);
  if (invalid) return privateResponse(invalid);
  try {
    const auth = await requireAdmin();
    if (auth.response) return privateResponse(auth.response);
    const decision = parseModerationDecision(await request.json().catch(() => null));
    if (!decision) return privateResponse(NextResponse.json({error: "Review the content and add a note when confirming a violation."}, {status: 400}));
    const {error} = await auth.client.rpc("admin_resolve_safety_case", decision);
    return privateResponse(error ? rpcFailure(error) : NextResponse.json({ok: true}));
  } catch { return privateResponse(rpcFailure({})); }
}
